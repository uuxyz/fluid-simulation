export const baseVertexShader = `in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}`;

export const advectShader = `precision highp float;
uniform sampler2D tVelocity;
uniform sampler2D tSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
in vec2 vUv;
out vec4 fragColor;

void main() {
    vec2 pos = vUv - dt * texture(tVelocity, vUv).xy * texelSize;
    fragColor = dissipation * texture(tSource, pos);
}`;

export const divergenceShader = `precision highp float;
uniform sampler2D tVelocity;
uniform sampler2D tSolid;
uniform vec2 texelSize;
in vec2 vUv;
out vec4 fragColor;

void main() {
    float sC = texture(tSolid, vUv).r;
    if (sC > 0.5) {
        fragColor = vec4(0.0);
        return;
    }

    float sL = texture(tSolid, vUv - vec2(texelSize.x, 0.0)).r;
    float sR = texture(tSolid, vUv + vec2(texelSize.x, 0.0)).r;
    float sB = texture(tSolid, vUv - vec2(0.0, texelSize.y)).r;
    float sT = texture(tSolid, vUv + vec2(0.0, texelSize.y)).r;

    float vL = texture(tVelocity, vUv - vec2(texelSize.x, 0.0)).x;
    float vR = texture(tVelocity, vUv + vec2(texelSize.x, 0.0)).x;
    float vB = texture(tVelocity, vUv - vec2(0.0, texelSize.y)).y;
    float vT = texture(tVelocity, vUv + vec2(0.0, texelSize.y)).y;

    if (sL > 0.5) vL = 0.0;
    if (sR > 0.5) vR = 0.0;
    if (sB > 0.5) vB = 0.0;
    if (sT > 0.5) vT = 0.0;

    float div = 0.5 * (vR - vL + vT - vB);
    fragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

export const jacobiShader = `precision highp float;
uniform sampler2D tPressure;
uniform sampler2D tDivergence;
uniform sampler2D tSolid;
uniform vec2 texelSize;
in vec2 vUv;
out vec4 fragColor;

void main() {
    float sC = texture(tSolid, vUv).r;
    if (sC > 0.5) {
        fragColor = vec4(0.0);
        return;
    }

    float sL = texture(tSolid, vUv - vec2(texelSize.x, 0.0)).r;
    float sR = texture(tSolid, vUv + vec2(texelSize.x, 0.0)).r;
    float sB = texture(tSolid, vUv - vec2(0.0, texelSize.y)).r;
    float sT = texture(tSolid, vUv + vec2(0.0, texelSize.y)).r;

    float pC = texture(tPressure, vUv).r;
    float pL = (sL > 0.5) ? pC : texture(tPressure, vUv - vec2(texelSize.x, 0.0)).r;
    float pR = (sR > 0.5) ? pC : texture(tPressure, vUv + vec2(texelSize.x, 0.0)).r;
    float pB = (sB > 0.5) ? pC : texture(tPressure, vUv - vec2(0.0, texelSize.y)).r;
    float pT = (sT > 0.5) ? pC : texture(tPressure, vUv + vec2(0.0, texelSize.y)).r;

    float div = texture(tDivergence, vUv).r;
    float pNew = (pL + pR + pB + pT - div) * 0.25;
    fragColor = vec4(pNew, 0.0, 0.0, 1.0);
}`;

export const projectShader = `precision highp float;
uniform sampler2D tVelocity;
uniform sampler2D tPressure;
uniform sampler2D tSolid;
uniform vec2 texelSize;
in vec2 vUv;
out vec4 fragColor;

void main() {
    float sC = texture(tSolid, vUv).r;
    if (sC > 0.5) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    float sL = texture(tSolid, vUv - vec2(texelSize.x, 0.0)).r;
    float sR = texture(tSolid, vUv + vec2(texelSize.x, 0.0)).r;
    float sB = texture(tSolid, vUv - vec2(0.0, texelSize.y)).r;
    float sT = texture(tSolid, vUv + vec2(0.0, texelSize.y)).r;

    float pC = texture(tPressure, vUv).r;
    float pL = (sL > 0.5) ? pC : texture(tPressure, vUv - vec2(texelSize.x, 0.0)).r;
    float pR = (sR > 0.5) ? pC : texture(tPressure, vUv + vec2(texelSize.x, 0.0)).r;
    float pB = (sB > 0.5) ? pC : texture(tPressure, vUv - vec2(0.0, texelSize.y)).r;
    float pT = (sT > 0.5) ? pC : texture(tPressure, vUv + vec2(0.0, texelSize.y)).r;

    vec2 v = texture(tVelocity, vUv).xy;
    v -= 0.5 * vec2(pR - pL, pT - pB);

    fragColor = vec4(v, 0.0, 1.0);
}`;

export const forceShader = `precision highp float;
uniform sampler2D tVelocity;
uniform vec2 gravity;
uniform float dt;
in vec2 vUv;
out vec4 fragColor;

void main() {
    vec2 v = texture(tVelocity, vUv).xy;
    v += gravity * dt;
    fragColor = vec4(v, 0.0, 1.0);
}`;

export const boundaryShader = `precision highp float;
uniform sampler2D tVelocity;
uniform sampler2D tSolid;
uniform vec2 texelSize;
in vec2 vUv;
out vec4 fragColor;

void main() {
    vec2 v = texture(tVelocity, vUv).xy;
    float sC = texture(tSolid, vUv).r;
    if (sC > 0.5) {
        v = vec2(0.0);
    }
    fragColor = vec4(v, 0.0, 1.0);
}`;

export const renderShader = `precision highp float;
uniform sampler2D tSolid;
uniform sampler2D tPressure;
uniform sampler2D tVelocity;
uniform vec2 mouse;
uniform float brushRadius;
uniform float aspectRatio;
uniform int shape; // 0: Circle, 1: Square
uniform float uTime;
in vec2 vUv;
out vec4 fragColor;

vec3 rainbow(float h) {
    vec3 c = mod(h * 6.0 + vec4(0.0, 4.0, 2.0, 0.0).rgb, 6.0);
    return clamp(abs(c - 3.0) - 1.0, 0.0, 1.0);
}

void main() {
    float solid = texture(tSolid, vUv).r;
    float pressure = texture(tPressure, vUv).r;
    vec2 vel = texture(tVelocity, vUv).xy;

    vec3 waterBase = vec3(0.04, 0.1, 0.45); // Calm deep blue
    vec3 color = waterBase; 
    
    if (solid > 0.5) {
        color = vec3(0.08, 0.08, 0.1); // Dark walls
    } else {
        // --- Rainbow Pressure ---
        float p = abs(pressure) * 0.15;
        if (p > 0.005) {
            float hue = p * 0.4 + uTime * 0.15;
            vec3 rainbowCol = rainbow(hue);
            
            // Stronger edge mask
            float edgeMask = smoothstep(0.0, 0.02, vUv.x) * smoothstep(1.0, 0.98, vUv.x) *
                             smoothstep(0.0, 0.02, vUv.y) * smoothstep(1.0, 0.98, vUv.y);
            
            float strength = smoothstep(0.005, 0.05, p) * 0.8;
            color = mix(color, rainbowCol, strength * edgeMask);
        }
        
        // --- Velocity Highlight ---
        float velMag = length(vel);
        color += vec3(0.4, 0.7, 1.0) * pow(clamp(velMag * 0.1, 0.0, 1.0), 2.5);
    }

    // Render Brush Cursor (Only if it is inside the viewport)
    if (mouse.x > -0.5) {
        vec2 p = vUv - mouse;
        p.x *= aspectRatio;
        float dist = 0.0;
        float radius = brushRadius;
        if (shape == 1) radius *= 2.0;

        if (shape == 0) {
            dist = length(p);
        } else {
            vec2 d = abs(p);
            dist = max(d.x, d.y);
        }

        float edge = abs(dist - radius);
        float outline = smoothstep(0.003, 0.001, edge);
        color = mix(color, vec3(1.0, 1.0, 1.0), outline * 0.6);
    }

    fragColor = vec4(color, 1.0);
}`;

export const splatShader = `precision highp float;
uniform sampler2D tVelocity;
uniform vec2 point;
uniform vec2 force;
uniform float radius;
uniform float aspectRatio;
in vec2 vUv;
out vec4 fragColor;

void main() {
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    float splat = exp(-dot(p, p) / radius);
    vec2 v = texture(tVelocity, vUv).xy;
    v += force * splat;
    fragColor = vec4(v, 0.0, 1.0);
}`;

export const paintShader = `precision highp float;
uniform sampler2D tTexture;
uniform vec2 point;
uniform float radius;
uniform float value;
uniform float aspectRatio;
uniform int shape; // 0: Circle, 1: Square/Bucket
in vec2 vUv;
out vec4 fragColor;

void main() {
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    
    float brush = 0.0;
    if (shape == 0) {
        float dist = length(p);
        brush = smoothstep(radius, radius * 0.8, dist);
    } else {
        // Square brush
        vec2 d = abs(p) - vec2(radius);
        float dist = max(d.x, d.y);
        brush = smoothstep(0.01, 0.0, dist);
    }
    
    float old = texture(tTexture, vUv).r;
    float result = mix(old, value, brush);
    
    fragColor = vec4(result, 0.0, 0.0, 1.0);
}`;

export const mandelbrotShader = `precision highp float;
uniform float aspectRatio;
uniform vec2 offset;
uniform float zoom;
in vec2 vUv;
out vec4 fragColor;

void main() {
    // Map UV to complex plane with dynamic zoom and offset
    vec2 c = (vUv - 0.5) * 3.0 / zoom;
    c.x *= aspectRatio;
    c += offset;

    vec2 z = vec2(0.0);
    int iterations = 0;
    const int maxIterations = 100;

    for (int i = 0; i < maxIterations; i++) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        if (dot(z, z) > 4.0) break;
        iterations++;
    }

    float isSet = iterations == maxIterations ? 1.0 : 0.0;
    
    float result = isSet;
    // Add a boundary wall
    if (vUv.x < 0.005 || vUv.x > 0.995 || vUv.y < 0.005 || vUv.y > 0.995) result = 1.0;

    fragColor = vec4(result, 0.0, 0.0, 1.0);
}`;
