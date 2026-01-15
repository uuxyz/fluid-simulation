import * as THREE from 'three';
import {
    baseVertexShader,
    advectShader,
    divergenceShader,
    jacobiShader,
    projectShader,
    forceShader,
    boundaryShader,
    renderShader,
    splatShader,
    paintShader,
    mandelbrotShader
} from './shaders';

export class FluidSimulation {
    private scene: THREE.Scene;
    private camera: THREE.OrthographicCamera;
    private renderer: THREE.WebGLRenderer;
    private mesh: THREE.Mesh;

    private width: number;
    private height: number;

    private velRT1: THREE.WebGLRenderTarget;
    private velRT2: THREE.WebGLRenderTarget;
    private pressureRT1: THREE.WebGLRenderTarget;
    private pressureRT2: THREE.WebGLRenderTarget;
    private divRT: THREE.WebGLRenderTarget;
    private solidRT1: THREE.WebGLRenderTarget;
    private solidRT2: THREE.WebGLRenderTarget;

    private advectMat: THREE.RawShaderMaterial;
    private divMat: THREE.RawShaderMaterial;
    private jacobiMat: THREE.RawShaderMaterial;
    private projectMat: THREE.RawShaderMaterial;
    private forceMat: THREE.RawShaderMaterial;
    private boundaryMat: THREE.RawShaderMaterial;
    private renderMat: THREE.RawShaderMaterial;
    private splatMat: THREE.RawShaderMaterial;
    private paintMat: THREE.RawShaderMaterial;
    private mandelbrotMat: THREE.RawShaderMaterial;

    private lastMouse = new THREE.Vector2(-1, -1);
    private isMouseDown = false;
    private splashes: { x: number, y: number, dx: number, dy: number }[] = [];
    
    // 0: Interact (Velocity), 3: Add Wall, 4: Remove Wall
    private mode = 0; 
    private isBucketMode = false;
    private brushRadius = 0.02;
    private uiStats: HTMLElement | null = null;

    private mandelZoom = 1.0;
    private mandelOffset = new THREE.Vector2(-0.5, 0.0);
    private isMiddleMouseDown = false;
    private isUIHidden = false;

    constructor(renderer: THREE.WebGLRenderer, width: number, height: number) {
        this.renderer = renderer;
        this.width = width;
        this.height = height;

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const quad = new THREE.PlaneGeometry(2, 2);
        this.mesh = new THREE.Mesh(quad);
        this.scene.add(this.mesh);

        const options = {
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false,
        };

        this.velRT1 = new THREE.WebGLRenderTarget(width, height, options);
        this.velRT2 = new THREE.WebGLRenderTarget(width, height, options);
        this.pressureRT1 = new THREE.WebGLRenderTarget(width, height, options);
        this.pressureRT2 = new THREE.WebGLRenderTarget(width, height, options);
        this.divRT = new THREE.WebGLRenderTarget(width, height, options);
        this.solidRT1 = new THREE.WebGLRenderTarget(width, height, options);
        this.solidRT2 = new THREE.WebGLRenderTarget(width, height, options);

        const texelSize = new THREE.Vector2(1 / width, 1 / height);

        this.advectMat = this.createMat(advectShader, {
            tVelocity: { value: null },
            tSource: { value: null },
            texelSize: { value: texelSize },
            dt: { value: 0.016 },
            dissipation: { value: 0.99 }
        });

        this.divMat = this.createMat(divergenceShader, {
            tVelocity: { value: null },
            tSolid: { value: null },
            texelSize: { value: texelSize }
        });

        this.jacobiMat = this.createMat(jacobiShader, {
            tPressure: { value: null },
            tDivergence: { value: null },
            tSolid: { value: null },
            texelSize: { value: texelSize }
        });

        this.projectMat = this.createMat(projectShader, {
            tVelocity: { value: null },
            tPressure: { value: null },
            tSolid: { value: null },
            texelSize: { value: texelSize }
        });

        this.forceMat = this.createMat(forceShader, {
            tVelocity: { value: null },
            gravity: { value: new THREE.Vector2(0, 0) },
            dt: { value: 0.016 }
        });

        this.boundaryMat = this.createMat(boundaryShader, {
            tVelocity: { value: null },
            tSolid: { value: null },
            texelSize: { value: texelSize }
        });

        this.renderMat = this.createMat(renderShader, {
            tSolid: { value: null },
            tPressure: { value: null },
            tVelocity: { value: null },
            mouse: { value: new THREE.Vector2(-1, -1) },
            brushRadius: { value: 0.02 },
            aspectRatio: { value: width / height },
            shape: { value: 0 },
            uTime: { value: 0 }
        });

        this.splatMat = this.createMat(splatShader, {
            tVelocity: { value: null },
            point: { value: new THREE.Vector2() },
            force: { value: new THREE.Vector2() },
            radius: { value: 0.002 },
            aspectRatio: { value: width / height }
        });

        this.paintMat = this.createMat(paintShader, {
            tTexture: { value: null },
            point: { value: new THREE.Vector2() },
            radius: { value: 0.02 },
            value: { value: 1.0 },
            aspectRatio: { value: width / height },
            shape: { value: 0 }
        });

        this.mandelbrotMat = this.createMat(mandelbrotShader, {
            aspectRatio: { value: width / height },
            zoom: { value: this.mandelZoom },
            offset: { value: this.mandelOffset }
        });

        this.reset(true); 
        this.initInput();
        this.initUI();
    }

    public reset(useMandelbrot: boolean = false) {
        // Clear velocity and pressure manually
        this.renderer.setRenderTarget(this.velRT1);
        this.renderer.clear();
        this.renderer.setRenderTarget(this.velRT2);
        this.renderer.clear();
        this.renderer.setRenderTarget(this.pressureRT1);
        this.renderer.clear();
        this.renderer.setRenderTarget(this.pressureRT2);
        this.renderer.clear();

        if (useMandelbrot) {
            this.updateMandelbrotBuffers();
        } else {
            this.initSolid();
        }
    }

    private updateMandelbrotBuffers() {
        this.mesh.material = this.mandelbrotMat;
        this.mandelbrotMat.uniforms['zoom']!.value = this.mandelZoom;
        this.mandelbrotMat.uniforms['offset']!.value.copy(this.mandelOffset);
        
        // Generate Solids
        this.renderer.setRenderTarget(this.solidRT1);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(this.solidRT2);
        this.renderer.render(this.scene, this.camera);
    }

    private initUI() {
        this.uiStats = document.getElementById('stats');
        if (!this.uiStats) {
            this.uiStats = document.createElement('div');
            this.uiStats.id = 'stats';
            this.uiStats.style.position = 'absolute';
            this.uiStats.style.top = '10px';
            this.uiStats.style.left = '10px';
            this.uiStats.style.padding = '10px';
            this.uiStats.style.backgroundColor = 'rgba(0,0,0,0.5)';
            this.uiStats.style.color = 'white';
            this.uiStats.style.fontFamily = 'monospace';
            this.uiStats.style.pointerEvents = 'none';
            document.body.appendChild(this.uiStats);
        }
        
        window.addEventListener('keydown', (e) => {
            if (e.key === '3') this.mode = 3;
            else if (e.key === '4') this.mode = 4;
            else if (e.key === '0' || e.key === '`' || e.key === '5') this.mode = 0;
            else if (e.key === 'f' || e.key === 'F') {
                this.isBucketMode = !this.isBucketMode;
            } else if (e.key === 'm' || e.key === 'M') {
                this.reset(true);
            } else if (e.key === 'r' || e.key === 'R') {
                this.reset(true);
            } else if (e.key === 'h' || e.key === 'H') {
                this.isUIHidden = !this.isUIHidden;
                const uiContainer = document.getElementById('ui');
                if (uiContainer) {
                    uiContainer.style.display = this.isUIHidden ? 'none' : 'block';
                }
            } else if (e.key === '[') {
                this.brushRadius = Math.max(0.001, this.brushRadius * 0.8);
            } else if (e.key === ']') {
                this.brushRadius = Math.min(0.5, this.brushRadius * 1.2);
            }
        });
    }

    private updateUI(isPaused: boolean = true, frameCount: number = 0) {
        if (!this.uiStats) return;
        const modes: { [key: number]: string } = {
            0: "0: Interact (Velocity)",
            3: "3: Add Wall",
            4: "4: Remove Wall"
        };
        this.uiStats.innerText = `Status: ${isPaused ? 'PAUSED' : 'RUNNING'}
Physics Frames: ${frameCount}
Current Mode: ${modes[this.mode] || 'Interact'}
Bucket Mode (F): ${this.isBucketMode ? 'ON (Square)' : 'OFF (Circle)'}
Brush Size ([/]): ${this.brushRadius.toFixed(4)}

Mandelbrot:
Zoom (Wheel): ${this.mandelZoom.toExponential(2)}
Offset (Mid-Drag): ${this.mandelOffset.x.toFixed(4)}, ${this.mandelOffset.y.toFixed(4)}

Controls:
SPACE: Pause/Run Physics
T: Pause Shader Time
K: Step Frame (when paused)
0, 3, 4: Change Tool
F: Toggle Bucket Mode
R: Reset View
Mouse Wheel: Mandelbrot Zoom
Middle Mouse: Pan Mandelbrot
[/]: Adjust Brush Size
`;
    }



    private initInput() {
        const canvas = this.renderer.domElement;
        
        const updateMouse = (e: MouseEvent | TouchEvent) => {
            let x, y;
            if (e instanceof MouseEvent) {
                x = e.clientX;
                y = e.clientY;
            } else {
                x = e.touches[0]!.clientX;
                y = e.touches[0]!.clientY;
            }
            const rect = canvas.getBoundingClientRect();
            return new THREE.Vector2(
                (x - rect.left) / rect.width,
                1.0 - (y - rect.top) / rect.height
            );
        };

        const handleMove = (x: number, y: number, isInitialClick: boolean = false) => {
            const currentMouse = new THREE.Vector2(x, y);
            const delta = new THREE.Vector2().subVectors(currentMouse, this.lastMouse);
            this.lastMouse.copy(currentMouse);
            
            if (this.mode === 0) {
                // Velocity Splat
                const forceScale = 150 * (this.brushRadius / 0.02);
                if (delta.lengthSq() > 0.000001) {
                    this.splashes.push({
                        x: currentMouse.x,
                        y: currentMouse.y,
                        dx: delta.x * forceScale,
                        dy: delta.y * forceScale
                    });
                } else if (isInitialClick || this.isMouseDown) {
                    // Toned down jitter for subtler feedback
                    const angle = Math.random() * Math.PI * 2.0;
                    const jitter = 0.1 * (this.brushRadius / 0.02);
                    this.splashes.push({
                        x: currentMouse.x,
                        y: currentMouse.y,
                        dx: Math.cos(angle) * jitter,
                        dy: Math.sin(angle) * jitter
                    });
                }
            } else {
                // Painting (Continuous)
                // We handle this in step() by checking isMouseDown and lastMouse
            }
        };

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.isMouseDown = true;
                this.lastMouse = updateMouse(e);
                handleMove(this.lastMouse.x, this.lastMouse.y, true);
            } else if (e.button === 1) {
                this.isMiddleMouseDown = true;
                this.lastMouse = updateMouse(e);
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            const m = updateMouse(e);
            if (this.isMiddleMouseDown) {
                const delta = new THREE.Vector2().subVectors(m, this.lastMouse);
                // Adjust movement by zoom and aspect ratio
                const worldDelta = new THREE.Vector2(
                    -delta.x * 3.0 / this.mandelZoom * (this.width / this.height),
                    -delta.y * 3.0 / this.mandelZoom
                );
                this.mandelOffset.add(worldDelta);
                this.updateMandelbrotBuffers();
                this.lastMouse.copy(m);
            } else if (this.isMouseDown) {
                handleMove(m.x, m.y);
            } else {
                this.lastMouse.copy(m);
            }
        });

        canvas.addEventListener('mouseup', (e) => { 
            if (e.button === 0) this.isMouseDown = false;
            if (e.button === 1) this.isMiddleMouseDown = false;
        });
        canvas.addEventListener('mouseleave', () => { 
            this.isMouseDown = false; 
            this.isMiddleMouseDown = false;
        });
        
        // Touch support
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.isMouseDown = true;
            this.lastMouse = updateMouse(e);
            if (this.mode !== 0) handleMove(this.lastMouse.x, this.lastMouse.y, true);
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.isMouseDown) {
                const m = updateMouse(e);
                handleMove(m.x, m.y);
            }
        }, { passive: false });

        canvas.addEventListener('touchend', () => { this.isMouseDown = false; });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            this.mandelZoom *= zoomFactor;
            this.updateMandelbrotBuffers();
        }, { passive: false });
    }

    private createMat(fragmentShader: string, uniforms: any) {
        return new THREE.RawShaderMaterial({
            vertexShader: baseVertexShader,
            fragmentShader,
            uniforms,
            glslVersion: THREE.GLSL3
        });
    }

    private initSolid() {
        const canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        const ctx = canvas.getContext('2d')!;
        
        const scaleX = this.width / 800;
        const scaleY = this.height / 600;
        ctx.scale(scaleX, scaleY);

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 800, 600);
        ctx.fillStyle = 'white';

        // Walls (Same as before)
        ctx.fillRect(0, 580, 800, 20);
        ctx.fillRect(0, 0, 20, 600);
        ctx.fillRect(780, 0, 20, 600);
        ctx.fillRect(0, 0, 800, 20);
        ctx.fillRect(100, 300, 10, 280);
        ctx.fillRect(300, 300, 10, 280);
        ctx.fillRect(100, 570, 210, 10);
        ctx.fillRect(500, 400, 10, 180);
        ctx.fillRect(700, 400, 10, 180);
        ctx.fillRect(500, 570, 210, 10);
        ctx.lineWidth = 30;
        ctx.beginPath();
        ctx.moveTo(200, 500); ctx.lineTo(200, 100); ctx.lineTo(600, 100); ctx.lineTo(600, 500); ctx.stroke();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(200, 510); ctx.lineTo(200, 100); ctx.lineTo(600, 100); ctx.lineTo(600, 510); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';

        const tex = new THREE.CanvasTexture(canvas);
        
        // Initialize BOTH solid buffers
        this.renderer.setRenderTarget(this.solidRT1);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex }));
        const scene = new THREE.Scene();
        scene.add(mesh);
        this.renderer.render(scene, this.camera);
        
        this.renderer.setRenderTarget(this.solidRT2);
        this.renderer.render(scene, this.camera);
    }

    step(dt: number) {
        const isPaused = dt <= 0;

        // --- 1. Interactions ---
        
        // A. Paint wall
        if (this.isMouseDown && (this.mode === 3 || this.mode === 4)) {
            this.mesh.material = this.paintMat;
            this.paintMat.uniforms['point']!.value.copy(this.lastMouse);
            this.paintMat.uniforms['shape']!.value = this.isBucketMode ? 1 : 0;
            this.paintMat.uniforms['radius']!.value = this.isBucketMode ? this.brushRadius * 2.0 : this.brushRadius;
            
            const val = this.mode === 3 ? 1.0 : 0.0;
            this.paintMat.uniforms['value']!.value = val;
            this.paintMat.uniforms['tTexture']!.value = this.solidRT1.texture;
            this.renderer.setRenderTarget(this.solidRT2);
            this.renderer.render(this.scene, this.camera);
            [this.solidRT1, this.solidRT2] = [this.solidRT2, this.solidRT1];
        }

        // B. Apply splat force
        if (this.splashes.length > 0) {
            this.mesh.material = this.splatMat;
            this.splatMat.uniforms['radius']!.value = this.brushRadius * 0.5; 
            for (const splash of this.splashes) {
                this.splatMat.uniforms['tVelocity']!.value = this.velRT1.texture;
                this.splatMat.uniforms['point']!.value.set(splash.x, splash.y);
                this.splatMat.uniforms['force']!.value.set(splash.dx, splash.dy);
                this.renderer.setRenderTarget(this.velRT2);
                this.renderer.render(this.scene, this.camera);
                [this.velRT1, this.velRT2] = [this.velRT2, this.velRT1];
            }
            this.splashes = [];
        }

        // --- 2. Physics evolution and constraints - only runs when not paused ---
        if (!isPaused) {
            this.advectMat.uniforms['dt']!.value = dt;
            this.forceMat.uniforms['dt']!.value = dt;

            // Velocity advection
            this.mesh.material = this.advectMat;
            this.advectMat.uniforms['tVelocity']!.value = this.velRT1.texture;
            this.advectMat.uniforms['tSource']!.value = this.velRT1.texture;
            this.renderer.setRenderTarget(this.velRT2);
            this.renderer.render(this.scene, this.camera);
            [this.velRT1, this.velRT2] = [this.velRT2, this.velRT1];

            // External force (gravity)
            this.mesh.material = this.forceMat;
            this.forceMat.uniforms['tVelocity']!.value = this.velRT1.texture;
            this.renderer.setRenderTarget(this.velRT2);
            this.renderer.render(this.scene, this.camera);
            [this.velRT1, this.velRT2] = [this.velRT2, this.velRT1];

            // Boundary constraints
            this.mesh.material = this.boundaryMat;
            this.boundaryMat.uniforms['tVelocity']!.value = this.velRT1.texture;
            this.boundaryMat.uniforms['tSolid']!.value = this.solidRT1.texture;
            this.renderer.setRenderTarget(this.velRT2);
            this.renderer.render(this.scene, this.camera);
            [this.velRT1, this.velRT2] = [this.velRT2, this.velRT1];

            // Pressure solve (ensure divergence-free velocity field)
            this.mesh.material = this.divMat;
            this.divMat.uniforms['tVelocity']!.value = this.velRT1.texture;
            this.divMat.uniforms['tSolid']!.value = this.solidRT1.texture;
            this.renderer.setRenderTarget(this.divRT);
            this.renderer.render(this.scene, this.camera);

            this.mesh.material = this.jacobiMat;
                    this.jacobiMat.uniforms['tDivergence']!.value = this.divRT.texture;
                    this.jacobiMat.uniforms['tSolid']!.value = this.solidRT1.texture;
                    for (let i = 0; i < 25; i++) {
                        this.jacobiMat.uniforms['tPressure']!.value = this.pressureRT1.texture;
                        this.renderer.setRenderTarget(this.pressureRT2);
                        this.renderer.render(this.scene, this.camera);
                        [this.pressureRT1, this.pressureRT2] = [this.pressureRT2, this.pressureRT1];
                    }
                        this.mesh.material = this.projectMat;
            this.projectMat.uniforms['tVelocity']!.value = this.velRT1.texture;
            this.projectMat.uniforms['tPressure']!.value = this.pressureRT1.texture;
            this.projectMat.uniforms['tSolid']!.value = this.solidRT1.texture;
            this.renderer.setRenderTarget(this.velRT2);
            this.renderer.render(this.scene, this.camera);
            [this.velRT1, this.velRT2] = [this.velRT2, this.velRT1];
        }
    }

    render(isPaused: boolean = true, frameCount: number = 0, time: number = 0) {
        this.updateUI(isPaused, frameCount);
        this.mesh.material = this.renderMat;
        this.renderMat.uniforms['tSolid']!.value = this.solidRT1.texture;
        this.renderMat.uniforms['tPressure']!.value = this.pressureRT1.texture;
        this.renderMat.uniforms['tVelocity']!.value = this.velRT1.texture;
        this.renderMat.uniforms['mouse']!.value.copy(this.lastMouse);
        this.renderMat.uniforms['brushRadius']!.value = this.brushRadius;
        this.renderMat.uniforms['shape']!.value = this.isBucketMode ? 1 : 0;
        this.renderMat.uniforms['uTime']!.value = time;
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);
    }
}
