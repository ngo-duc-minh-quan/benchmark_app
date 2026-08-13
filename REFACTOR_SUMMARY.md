# Báo Cáo Nâng Cấp Phương Pháp Đo Hiệu Năng (Benchmark Methodology Refactor)

Báo cáo này tổng hợp chi tiết các thay đổi về mặt kiến trúc, đồng nhất đơn vị tính toán và công thức điểm số đã được triển khai cho ứng dụng **BenchmarkX** (phiên bản v2.0).

---

## 1. Chi Tiết Các Thay Đổi Trong Thành Phần (Component Changes)

### 📄 `components/NativeStressTestEngine.tsx`

| Tính năng | Trước khi sửa | Sau khi sửa |
| :--- | :--- | :--- |
| **Đo 1% Low & Stability** | Gom FPS trung bình mỗi window **500 ms**, làm mất các điểm micro-stutter ngắn. | Đo thời gian render thực tế từng frame (`frameTime = ts - lastFrameTs`) qua callback `requestAnimationFrame`. |
| **Lọc dữ liệu rác** | Không lọc rác hoặc ngưỡng rộng `< 1000ms`. | Loại frame-time $\ge 250\text{ms}$ như interruption/outlier heuristic (`frameTime > 0 && frameTime < 250ms`); không dùng threshold này để xác định nguyên nhân. |
| **Đo dung lượng Pin** | Đọc phần trăm pin *sau* khi CPU test kết thúc (chỉ đo GPU phase). | Đọc phần trăm pin **trước** khi CPU test bắt đầu, đo được tổng tiêu thụ cho toàn bộ bài test. |
| **Hiển thị Pin (UI)** | Hiển thị % pin thô bất kể độ phân giải API phần cứng. | Khi `batteryDrain < 1%`: Hiển thị `value: <1%` và `sub: below reliable resolution` để tránh suy luận "Không hao pin". |

---

### 📄 `lib/scoreCalculator.ts` & `screens/BenchmarkScreen.tsx`

| Tính năng | Trước khi sửa | Sau khi sửa |
| :--- | :--- | :--- |
| **Signature `calculateScore`** | `calculateScore(fpsArray, batteryDrain, ...)` | `calculateScore(fpsArray, frameTimesMs, batteryDrain, ...)` |
| **Công thức 1% Low** | Lấy 1% số lượng mẫu FPS 500ms tệ nhất. | Lấy 1% mảng `frameTimesMs` tệ nhất, tính `worstAverageMs` rồi đổi sang FPS: `1000 / worstAverageMs`. |
| **Xử lý 60Hz Cap (Android)** | Tự động hạ `effectiveTargetHz` xuống 60 để nhân điểm GPU lên. | Chuyển thành `detectPossible60HzLock` (`boolean`). Display card hiển thị `detectedHz` cùng chú thích `possible 60Hz cap observed`. KHÔNG nắn điểm GPU. |
| **Công thức Graphics Score** | `0.7 * perfScore + 0.3 * stability` (Dựa trên targetHz). | Đổi tên UI thành **Graphics Score**, chuẩn hóa theo `COMMON_TARGET_FPS = 60`:<br>- **55%** Sustained FPS (`avg / 60`)<br>- **25%** 1% Low (`onePercentLow / 60`)<br>- **10%** Frame Stability<br>- **10%** Thermal Retention |

---

### 🧠 `lib/cpuBenchmark.ts` & `HiddenWorkerBridge.tsx` (CPU Benchmark Refactor)

| Tính năng | Trước khi sửa | Sau khi sửa |
| :--- | :--- | :--- |
| **Đơn vị đo (Work Units)** | Single-Core cộng `primeSieve` count; Multi-Core cộng `100 ops` ngẫu nhiên. | **Đồng nhất Work Unit**: 1 Work Unit = `1x primeSieve(500,000) + 1x matMul(100)` cho cả Single-Core và Web Worker Multi-Core. |
| **Ma trận Math (matMul)** | Khởi tạo mảng Float64Array toàn số `0` hoặc dùng `Math.random()`. | Sử dụng mảng Float64Array tính toán **deterministic** để số phép tính đạt độ ổn định cao. |
| **Thang đo CPU Baseline** | Hardcode `1,000,000 ops/sec`. | Định nghĩa `PROVISIONAL_SINGLE_CORE_BASELINE = 40` (Provisional baseline tạm thời trong thời gian chờ calibration thực nghiệm trên 5–10 thiết bị). |
| **Worker Engine Comment** | Ghi nhầm "native multi-threaded Web Workers". | Sửa comment đúng bản chất: *Runs multi-core JavaScript workload using Web Workers inside a hidden WebView*. |

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

## 3. Trạng Thái Kiểm Thử (Verification Status)

- **TypeScript Typecheck (`npx tsc --noEmit`)**: PASS (0 errors)
- **Tương thích ngược**: Hỗ trợ fallback tính toán nếu `frameTimesMs` trống.
