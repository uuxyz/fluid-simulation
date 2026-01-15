import * as THREE from 'three';
import { FluidSimulation } from './fluid';

function main() {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        precision: 'highp',
    });

    // 1. Display & Simulation Resolution
    const pixelRatio = window.devicePixelRatio || 1;
    const physicalWidth = window.innerWidth * pixelRatio;
    const physicalHeight = window.innerHeight * pixelRatio;

    // Limit simulation width to 800 or native physical width, whichever is smaller
    const simWidth = Math.min(800, Math.floor(physicalWidth));
    const aspectRatio = physicalWidth / physicalHeight;
    const simHeight = Math.floor(simWidth / aspectRatio);

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(pixelRatio);

    console.log(`Simulation Resolution: ${simWidth}x${simHeight} (Physical: ${Math.floor(physicalWidth)}x${Math.floor(physicalHeight)})`);

    const simulation = new FluidSimulation(renderer, simWidth, simHeight);

    let lastTime = performance.now();
    let isPaused = true;
    let isShaderTimePaused = false;
    let stepOnce = false;
    let physicsFrameCount = 0;
    let totalShaderTime = 0;

    function animate() {
        requestAnimationFrame(animate);

        const now = performance.now();
        let dt = (now - lastTime) / 1000;
        lastTime = now;

        if (!isShaderTimePaused) {
            totalShaderTime += dt;
        }

        if (!isPaused || stepOnce) {
            // Cap dt to prevent instability (more aggressive for single substep)
            if (dt > 0.02) dt = 0.02;
            if (stepOnce) dt = 0.016;

            // Using 1 substep for maximum performance at high resolutions
            const substeps = 1;
            for (let i = 0; i < substeps; i++) {
                simulation.step(dt / substeps);
                physicsFrameCount++;
            }
            stepOnce = false;
        } else {
            // Even when paused, allow painting/interaction by calling a minimal step with dt=0
            simulation.step(0);
        }
        
        simulation.render(isPaused, physicsFrameCount, totalShaderTime);
    }

    animate();

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            isPaused = !isPaused;
        }
        if (e.key === 't' || e.key === 'T') {
            isShaderTimePaused = !isShaderTimePaused;
        }
        if (e.key === 'k' || e.key === 'K') {
            if (isPaused) {
                stepOnce = true;
            }
        }
    });

    window.addEventListener('resize', () => {
        const newWidth = window.innerWidth;
        const newHeight = window.innerHeight;
        renderer.setSize(newWidth, newHeight);
    });
}

main();