# KeyFlow Piano

**Tiếng Việt** | [English](README.en.md)

**[Chơi piano trên trình duyệt →](https://key-flow-piano.vercel.app)**

KeyFlow Piano là dự án cá nhân được phát triển theo phong cách **vibe coding**, với sự hỗ trợ của AI trong quá trình viết và chỉnh sửa code. Dự án được chia sẻ miễn phí để học tập, thử nghiệm và tận hưởng việc chơi nhạc; **không phục vụ kinh doanh hay thu lợi nhuận**.

## Tính năng

- 61 phím đàn C2–C7, chơi bằng chuột, cảm ứng hoặc 24 vị trí QWERTY.
- Tiếng grand piano từ 21 sample Salamander được lưu cùng ứng dụng.
- Điều chỉnh âm lượng, octave, sustain và sắc thái; lưu các thiết lập trên thiết bị.
- PWA với dữ liệu offline được kiểm tra integrity và cập nhật theo thao tác của người dùng.
- Thanh điều khiển kéo thả và lời nhắc xoay ngang trên màn hình nhỏ.

## Bắt đầu chơi

1. Mở [bản demo](https://key-flow-piano.vercel.app) và chờ dữ liệu tiếng đàn tải xong; dùng nút tải/thử lại nếu cần.
2. Nhấn **Start Piano** để bật âm thanh. Trình duyệt cần thao tác này mỗi khi mở phiên chơi mới.
3. Nhấn phím hoặc chạm vào đàn. Thử **Z + C + B** để chơi hợp âm C3–E3–G3.

| Hàng | Vị trí phím QWERTY | Vùng nốt mặc định |
| --- | --- | --- |
| Dưới | Z S X D C V G B H N J M | C3–B3 |
| Trên | Q 2 W 3 E R 5 T 6 Y 7 U | C4–B4 |

**↑/↓** chuyển octave; giữ **Space** để sustain trong vùng chơi. Nhãn phím đi theo octave hiện tại. Ánh xạ dùng vị trí phím vật lý; ký tự in trên bàn phím khác QWERTY có thể khác. Số nốt nhận được đồng thời còn phụ thuộc phần cứng bàn phím.

PWA cần kết nối mạng để tải đầy đủ lần đầu. Chơi offline chỉ khả dụng sau khi cache đủ dữ liệu của bản hiện tại. Việc cài ứng dụng và hỗ trợ trình duyệt tùy nền tảng; độ trễ âm thanh và khả năng tương thích mọi trình duyệt chưa được xác nhận.

## Chạy trên máy

Yêu cầu **Node.js 22.23.1** và **pnpm 10.6.3** theo `.nvmrc` và `packageManager`.

```sh
git clone https://github.com/vudinhthu/keyflow-piano-app.git
cd keyflow-piano-app
nvm use
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Mở URL localhost do Vite hiển thị. Không cần API key hoặc dịch vụ âm thanh bên ngoài khi chạy.

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm samples:verify
corepack pnpm notices:verify
corepack pnpm build
corepack pnpm preview
```

Build sẽ dừng nếu file notices không khớp với dependencies đang cài. Sau khi thay đổi dependencies, chạy `corepack pnpm notices:generate` và review nội dung trước khi commit.

Bộ kiểm tra trình duyệt dùng Chrome đã cài trên máy:

```sh
corepack pnpm test:mvp
```

Lệnh tự build/chạy preview và kiểm tra controls, âm thanh, settings, offline, cache integrity, cập nhật an toàn và giao diện PWA. Báo cáo tạo trong `output/`, không được commit.

## Ghi nhận & cảm ơn

Xin cảm ơn các tác giả, maintainer và cộng đồng mã nguồn mở đã tạo ra những thư viện, công cụ và bộ âm thanh giúp KeyFlow Piano trở thành hiện thực.

| Nguồn | Vai trò | Giấy phép |
| --- | --- | --- |
| [React / React DOM](https://github.com/react/react) | Giao diện và hiển thị | MIT |
| [Tone.js](https://github.com/Tonejs/Tone.js) | Sampler và xử lý âm thanh | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | Trạng thái giao diện | MIT |
| [Vite](https://github.com/vitejs/vite), [React plugin](https://github.com/vitejs/vite-plugin-react) | Dev server và build | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Kiểm tra kiểu | Apache-2.0 |
| [Tailwind CSS / Vite plugin](https://github.com/tailwindlabs/tailwindcss) | CSS và tích hợp build | MIT |
| [Vite PWA](https://github.com/vite-pwa/vite-plugin-pwa) | Tích hợp PWA | MIT |
| [Workbox](https://github.com/GoogleChrome/workbox) | Service worker và precache | MIT |
| [Vitest](https://github.com/vitest-dev/vitest) | Kiểm thử logic | MIT |
| [Playwright CLI](https://github.com/microsoft/playwright-cli) | Kiểm tra trình duyệt | Apache-2.0 |
| [ESLint / @eslint/js](https://github.com/eslint/eslint), [typescript-eslint](https://github.com/typescript-eslint/typescript-eslint) | Kiểm tra code | MIT |
| [React Hooks plugin](https://github.com/react/react/tree/main/packages/eslint-plugin-react-hooks), [React Refresh plugin](https://github.com/ArnaudBarre/eslint-plugin-react-refresh) | Quy tắc lint React | MIT |
| [globals](https://github.com/sindresorhus/globals) | Biến môi trường cho lint | MIT |
| [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) | Kiểu cho Node.js, React và React DOM | MIT |
| [Lucide](https://github.com/lucide-icons/lucide) / [Feather](https://github.com/feathericons/feather) | Hình học SVG mũi tên điều khiển, được điều chỉnh cho ứng dụng | ISC / MIT |

Các dependencies âm thanh/worker gián tiếp và nguyên văn thông báo cho các thành phần được phân phối có trong [THIRD_PARTY_NOTICES](public/THIRD_PARTY_NOTICES.md). `pnpm-lock.yaml` ghi chính xác phiên bản dependency.

**Âm thanh:** [Salamander Grand Piano](https://github.com/sfzinstruments/SalamanderGrandPiano) của **Alexander Holm**, theo **CC BY 3.0**; bản MP3 web từ [Tone.js audio](https://github.com/Tonejs/audio/tree/master/salamander). Dự án dùng 21 file MP3 không sửa đổi so với bản web nguồn, một lớp dynamic; các nốt còn lại dùng pitch shifting. Xin cảm ơn Alexander Holm và cộng đồng Tone.js. Xem [attribution và nguồn chi tiết](public/samples/salamander/ATTRIBUTION.md).

Mục đích phi lợi nhuận nêu trên mô tả cách tác giả vận hành dự án; giấy phép và quyền của từng thành phần bên thứ ba vẫn được giữ nguyên. Credit không ngụ ý tác giả thư viện hoặc bộ âm thanh bảo trợ dự án.
