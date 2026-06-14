/**
 * VoiceOrb — the animated flame orb on the Voice screen. The visual is a direct
 * Skia (SkSL) port of `orb.glsl` from the design kit: layered simplex-noise
 * lighting in warm flame colors, slowly rotating, driven by a wall clock so it
 * animates continuously. Sized to a square; pass `size` for the diameter.
 */
import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';

// SkSL port of orb.glsl. GLSL `vecN` → `floatN`, `gl_FragCoord` → the `main`
// argument, and the entry returns `half4` with premultiplied alpha.
const SOURCE = Skia.RuntimeEffect.Make(`
uniform float2 iResolution;
uniform float iTime;
uniform float hover;
uniform float rot;
uniform float hoverIntensity;

float3 hash33(float3 p3) {
  p3 = fract(p3 * float3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yxz + 19.19);
  return -1.0 + 2.0 * fract(float3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx);
}

float snoise3(float3 p) {
  const float K1 = 0.333333333;
  const float K2 = 0.166666667;
  float3 i = floor(p + (p.x + p.y + p.z) * K1);
  float3 d0 = p - (i - (i.x + i.y + i.z) * K2);
  float3 e = step(float3(0.0), d0 - d0.yzx);
  float3 i1 = e * (1.0 - e.zxy);
  float3 i2 = 1.0 - e.zxy * (1.0 - e);
  float3 d1 = d0 - (i1 - K2);
  float3 d2 = d0 - (i2 - K1);
  float3 d3 = d0 - 0.5;
  float4 h = max(0.6 - float4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
  float4 n = h * h * h * h * float4(dot(d0, hash33(i)), dot(d1, hash33(i + i1)), dot(d2, hash33(i + i2)), dot(d3, hash33(i + 1.0)));
  return dot(float4(31.316), n);
}

float4 extractAlpha(float3 colorIn) {
  float a = max(max(colorIn.r, colorIn.g), colorIn.b);
  return float4(colorIn.rgb / (a + 1e-5), a);
}

const float3 baseColor1 = float3(1.0, 0.70, 0.25);
const float3 baseColor2 = float3(1.0, 0.37, 0.13);
const float3 baseColor3 = float3(0.55, 0.18, 0.02);
const float innerRadius = 0.6;
const float noiseScale = 0.65;

float light1(float intensity, float attenuation, float dist) {
  return intensity / (1.0 + dist * attenuation);
}
float light2(float intensity, float attenuation, float dist) {
  return intensity / (1.0 + dist * dist * attenuation);
}

float4 draw(float2 uv) {
  float3 color1 = baseColor1;
  float3 color2 = baseColor2;
  float3 color3 = baseColor3;
  float ang = atan(uv.y, uv.x);
  float len = length(uv);
  float invLen = len > 0.0 ? 1.0 / len : 0.0;
  float n0 = snoise3(float3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;
  float r0 = mix(mix(innerRadius, 1.0, 0.4), mix(innerRadius, 1.0, 0.6), n0);
  float d0 = distance(uv, (r0 * invLen) * uv);
  float v0 = light1(1.0, 10.0, d0);
  v0 *= smoothstep(r0 * 1.05, r0, len);
  float cl = cos(ang + iTime * 2.0) * 0.5 + 0.5;
  float a = iTime * -1.0;
  float2 pos = float2(cos(a), sin(a)) * r0;
  float d = distance(uv, pos);
  float v1 = light2(1.5, 5.0, d);
  v1 *= light1(1.0, 50.0, d0);
  float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
  float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);
  float3 col = mix(color1, color2, cl);
  col = mix(color3, col, v0);
  col = (col + v1) * v2 * v3;
  col = clamp(col, 0.0, 1.0);
  return extractAlpha(col);
}

half4 main(float2 fragCoord) {
  float2 center = iResolution.xy * 0.5;
  float size = min(iResolution.x, iResolution.y);
  float2 uv = (fragCoord - center) / size * 2.0;
  float angle = rot;
  float s = sin(angle);
  float c = cos(angle);
  uv = float2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
  uv.x += hover * hoverIntensity * 0.1 * sin(uv.y * 10.0 + iTime);
  uv.y += hover * hoverIntensity * 0.1 * sin(uv.x * 10.0 + iTime);
  float4 col = draw(uv);
  return half4(col.rgb * col.a, col.a);
}
`)!;

interface VoiceOrbProps {
  size?: number;
}

export function VoiceOrb({ size = 180 }: VoiceOrbProps) {
  const clock = useClock();

  const uniforms = useDerivedValue(() => ({
    iResolution: [size, size],
    iTime: clock.value / 1000,
    hover: 1,
    rot: 0,
    hoverIntensity: 0.6,
  }));

  return (
    <Canvas style={{ width: size, height: size }}>
      <Fill>
        <Shader source={SOURCE} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
