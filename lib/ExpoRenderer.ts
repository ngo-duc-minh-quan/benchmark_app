// lib/ExpoRenderer.ts
// Thay thế expo-three's Renderer để tránh lỗi WebGL2 với three@0.162
// three@0.162 là version cuối cùng hỗ trợ WebGL1 context từ expo-gl
//
// expo-gl cung cấp WebGL1 context (ExpoWebGLRenderingContext)
// three@0.163+ đã drop WebGL1 → "WebGL 1 is not supported since r163"
// Solution: dùng three@0.162 + canvas mock tự viết

import * as THREE from 'three';
import type { ExpoWebGLRenderingContext } from 'expo-gl';

// Canvas mock mà THREE.WebGLRenderer chấp nhận thay cho HTMLCanvasElement
function makeExpoCanvas(gl: ExpoWebGLRenderingContext) {
  const W = gl.drawingBufferWidth;
  const H = gl.drawingBufferHeight;

  return {
    width: W,
    height: H,
    clientWidth: W,
    clientHeight: H,
    style: {} as Record<string, string>,

    // THREE gọi getContext() để lấy GL context — trả về expo-gl context
    getContext(_type: string, _attrs?: unknown) {
      return gl;
    },

    addEventListener(_type: string, _fn: unknown) {},
    removeEventListener(_type: string, _fn: unknown) {},
    getBoundingClientRect() {
      return { left: 0, top: 0, right: W, bottom: H, width: W, height: H };
    },
    // Some THREE internals may need this
    parentNode: null,
    ownerDocument: null,
  };
}

/**
 * Tạo THREE.WebGLRenderer dùng expo-gl context (WebGL1).
 * Dùng thay thế `new Renderer({ gl })` từ expo-three.
 *
 * Sau mỗi frame PHẢI gọi: gl.endFrameEXP()
 */
export function createExpoRenderer(gl: ExpoWebGLRenderingContext): THREE.WebGLRenderer {
  const canvas = makeExpoCanvas(gl);

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: gl as unknown as WebGLRenderingContext,
    antialias: false,          // Tắt AA để tối đa FPS trên mobile
    powerPreference: 'high-performance',
    precision: 'mediump',      // Tiết kiệm bandwidth cho mobile GPU
  });

  renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
  renderer.setPixelRatio(1);   // expo-gl đã handle pixel ratio natively
  renderer.setClearColor(0x080b12, 1);
  renderer.shadowMap.enabled = false;

  return renderer;
}
