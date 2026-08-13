// components/HiddenWorkerBridge.tsx
// Runs multi-core JavaScript workload using Web Workers inside a hidden WebView.
// Completely self-contained to avoid local asset load issues on Android.

import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface Props {
  cpuCores: number;
  durationMs?: number;
  onComplete: (ops: number, elapsedMs: number) => void;
  onError: (error: string) => void;
}

export default function HiddenWorkerBridge({
  cpuCores,
  durationMs = 3000,
  onComplete,
  onError,
}: Props) {
  const webViewRef = useRef<WebView | null>(null);
  const timeoutRef = useRef<any>(null);

  // HTML with inline Web Worker Sieve/Matrix benchmark
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>CPU Multi-Core Bridge</title>
    </head>
    <body>
      <script>
        const workerCode = \`
          self.onmessage = function(e) {
            if (e.data.action === 'start') {
              const limit = 500000;
              const matrixSize = 100;
              let workUnits = 0;
              let checksum = 0;
              const startedAt = performance.now();
              const endTime = Date.now() + e.data.duration;

              // Sieve of Eratosthenes — 500k limit
              function primeSieve(lim) {
                const sieve = new Uint8Array(lim + 1).fill(1);
                sieve[0] = 0; sieve[1] = 0;
                for (let i = 2; i * i <= lim; i++) {
                  if (sieve[i]) {
                    for (let j = i * i; j <= lim; j += i) { sieve[j] = 0; }
                  }
                }
                let count = 0;
                for (let i = 2; i <= lim; i++) { if (sieve[i]) count++; }
                return count;
              }

              // Deterministic Matrix multiplication
              function matMul(size) {
                const a = new Float64Array(size * size);
                const b = new Float64Array(size * size);
                const c = new Float64Array(size * size);
                for (let i = 0; i < size * size; i++) {
                  a[i] = ((i * 17) % 100) / 100;
                  b[i] = ((i * 31) % 100) / 100;
                }
                for (let i = 0; i < size; i++) {
                  for (let k = 0; k < size; k++) {
                    const aik = a[i * size + k];
                    for (let j = 0; j < size; j++) { c[i * size + j] += aik * b[k * size + j]; }
                  }
                }
                return c[0];
              }

              while (Date.now() < endTime) {
                checksum += primeSieve(limit);
                checksum += matMul(matrixSize);
                workUnits++;
              }
              
              const elapsedMs = performance.now() - startedAt;
              self.postMessage({ action: 'done', ops: workUnits, elapsedMs: elapsedMs, checksum: checksum });
            }
          };
        \`;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);

        window.startBenchmark = function(cores, duration) {
          const workers = [];
          let finished = 0;
          let totalOps = 0;
          let maxElapsedMs = 0;

          for (let i = 0; i < cores; i++) {
            const worker = new Worker(workerUrl);
            worker.onmessage = function(e) {
              if (e.data.action === 'done') {
                totalOps += e.data.ops;
                if (e.data.elapsedMs > maxElapsedMs) maxElapsedMs = e.data.elapsedMs;
                finished++;
                worker.terminate();

                if (finished === cores) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    status: 'success',
                    ops: totalOps,
                    elapsedMs: maxElapsedMs || duration
                  }));
                }
              }
            };
            workers.push(worker);
          }

          for (let i = 0; i < cores; i++) {
            workers[i].postMessage({ action: 'start', duration: duration });
          }
        };
      </script>
    </body>
    </html>
  `;

  useEffect(() => {
    // Timeout safeguard: if workers don't report in durationMs + 2s, trigger fallback error
    timeoutRef.current = setTimeout(() => {
      console.warn('[HiddenWorkerBridge] Timeout waiting for multi-core results.');
      onError('Timeout');
    }, durationMs + 2000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [durationMs, onError]);

  const handleWebViewLoadEnd = () => {
    // Trigger benchmark immediately when HTML loads
    webViewRef.current?.injectJavaScript(`
      window.startBenchmark(${cpuCores}, ${durationMs});
      true;
    `);
  };

  const handleMessage = (event: any) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.status === 'success') {
        onComplete(data.ops, data.elapsedMs || durationMs);
      } else {
        onError(data.error || 'Worker execution failed');
      }
    } catch (err) {
      onError('Failed to parse Web Message: ' + String(err));
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        onLoadEnd={handleWebViewLoadEnd}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 0,
    height: 0,
    opacity: 0,
    position: 'absolute',
  },
});
