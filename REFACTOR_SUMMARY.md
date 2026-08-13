# Báo Cáo Nâng Cấp Phương Pháp Đo Hiệu Năng (Benchmark Methodology Refactor v2.1)

Báo cáo này tổng hợp chi tiết các thay đổi về mặt kiến trúc, đồng nhất đơn vị tính toán, lưu trữ throughput thực nghiệm và cơ chế kiểm thử tự động cho ứng dụng **BenchmarkX** (phiên bản v2.1).

---

## 1. Chi Tiết Các Thay Đổi Kiến Trúc & Kỹ Thuật (Architecture & Component Changes)

### 📄 `components/NativeStressTestEngine.tsx` & `lib/cpuBenchmark.ts`

| Tính năng | Trước khi sửa | Sau khi sửa |
| :--- | :--- | :--- |
| **Raw CPU Throughput** | Chỉ lưu điểm số `singleCoreScore` và `multiCoreScore` quy đổi. | Lưu trực tiếp **raw throughput**: `singleCoreWorkUnitsPerSec`, `multiCoreWorkUnitsPerSec`, và `cpuCoresUsed` để phục vụ Calibration thực nghiệm. |
| **Chính xác thời gian Worker** | Multi-Core lấy `durationMs` cố định 3000ms. | Web Worker đo chính xác `elapsedMs` thực tế từng luồng qua `performance.now()`, trả về `maxElapsedMs` để tính throughput chuẩn xác. |
| **Đo 1% Low & Stability** | Gom FPS trung bình mỗi window **500 ms**, làm mất các điểm micro-stutter ngắn. | Đo thời gian render thực tế từng frame (`frameTime = ts - lastFrameTs`) qua callback `requestAnimationFrame`. |
| **Lọc dữ liệu rác** | Ngưỡng rộng `< 1000ms`. | Loại frame-time $\ge 250\text{ms}$ như interruption/outlier heuristic (`0 < frameTime < 250ms`); không dùng threshold này để đoán nguyên nhân. |
| **Thang đo CPU Baseline** | Hardcode `1,000,000 ops/sec`. | Khai báo `PROVISIONAL_SINGLE_CORE_BASELINE = 40` (Provisional baseline tạm thời trong thời gian chờ calibration thực nghiệm trên 5–10 thiết bị). |

---

### 📄 `lib/scoreCalculator.ts`, `lib/api.ts` & `screens/CompareScreen.tsx`

| Tính năng | Trước khi sửa | Sau khi sửa |
| :--- | :--- | :--- |
| **Offline Queue Idempotency** | Không có Client ID, có nguy cơ gửi trùng result khi retry POST. | Thêm `clientResultId` (UUID/Timestamp format) trong `BenchmarkResult` & `SaveResultPayload` để chống trùng lặp dữ liệu trên server/queue. |
| **Leaderboard Connectivity** | Kiểm tra `isOnline` dựa trên `entries.length > 0` (Bug: Server online nhưng 0 entries -> bị báo Offline). | Trả về `LeaderboardResponse { success, entries, error }`. Đặt `isOnline = res.success` chính xác 100%. |
| **Hiển thị Pin (UI)** | Hiển thị % pin thô bất kể độ phân giải API phần cứng. | Khi `batteryDrain < 1%`: Hiển thị `value: <1%` và `sub: below reliable resolution` để tránh suy luận "Không hao pin". |
| **Xử lý 60Hz Cap (Android)** | Tự động hạ `effectiveTargetHz` xuống 60 để nhân điểm GPU lên. | Chuyển thành `detectPossible60HzLock` (`boolean`). Display card hiển thị `detectedHz` cùng chú thích `possible 60Hz cap observed`. KHÔNG nắn điểm GPU. |

---

### 🛡️ Hardware & Repository Hygiene (`app.json`, `useHardwareInfo.ts`, `.env.example`)

| Thành phần | Trước khi sửa | Sau khi sửa |
| :--- | :--- | :--- |
| **Version & Permissions (`app.json`)** | Version `1.0.0`, trùng lặp 2 quyền `READ_PHONE_STATE`, thừa `NSMotionUsageDescription`. | Cập nhật version `2.0.0`, dọn sạch `permissions: []` và gỡ bỏ `NSMotionUsageDescription`. |
| **Hardware Estimation Flags** | Coi giá trị ước lượng RAM/CPU như dữ liệu đo thật. | Thêm `freeRAMEstimated` và `cpuCoresEstimated` flags. Hiển thị rõ `~5.4 GB` trên UI khi đọc qua fallback logic. |
| **Environment Hygiene** | Commit trực tiếp `.env`. | Tạo `.env.example` chuẩn template và bổ sung `.env` vào `.gitignore`. |

---

## 2. Thống Kê Công Thức Mới (Graphics Score Formula)

Công thức **Graphics Score** mới đánh giá nhất quán hơn giữa các thiết bị có tần số quét màn hình khác nhau:

$$\text{Graphics Score} = \min\left(100, 0.55 \cdot S_{\text{perf}} + 0.25 \cdot S_{\text{low}} + 0.10 \cdot S_{\text{stability}} + 0.10 \cdot S_{\text{retention}}\right)$$

Trong đó:
- $S_{\text{perf}} = \min\left(100, \frac{\text{avgFPS}}{60} \times 100\right)$
- $S_{\text{low}} = \min\left(100, \frac{\text{1\% Low FPS}}{60} \times 100\right)$
- $S_{\text{stability}} = \max\left(0, 100 \times \left(1 - \frac{\sigma_{\text{frameTime}}}{\text{avgFrameTime}}\right)\right)$
- $S_{\text{retention}} = \text{Tỉ lệ giữ FPS giữa 15\% thời lượng đầu và 15\% thời lượng cuối}$

---

## 3. Trạng Thái Kiểm Thử & CI/CD Status

- **Unit Testing (Vitest)**: `npm test` → **PASSED (7/7 tests pass)**
  - Test kịch bản stable 60 FPS ($S_{\text{perf}} = 100$, $1\% Low = 60$, $Stability \ge 99$)
  - Test kịch bản stable 120 FPS (Capped ở 100 max)
  - Test kịch bản micro-stutter (50–100ms frames kéo 1% Low giảm)
  - Test thermal retention (đầu 60 FPS, cuối 30 FPS $\to$ retention $\approx 50\%$)
  - Test fallback `fpsArray` khi thiếu `frameTimesMs`
  - Test input rỗng (`score = 0`, không bị `NaN` / `Infinity`)
- **Local Typecheck (`npm run typecheck`)**: PASS (0 errors)
- **Tự động hóa CI (GitHub Actions)**: Đã cấu hình `.github/workflows/ci.yml` tự động chạy cả `npm run typecheck` và `npm test` trên mọi Push / Pull Request.
