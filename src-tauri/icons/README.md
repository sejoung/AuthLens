# Tauri Icons

이 디렉토리의 라스터 아이콘은 `docs/icon.svg`에서 자동 생성됩니다.

## 재생성 방법

`@tauri-apps/cli`의 icon generator는 SVG를 직접 받지 않고 1024×1024 PNG를 요구합니다.
macOS 기본 `qlmanage`로 SVG → PNG 변환 후 `tauri icon` 실행하세요.

```sh
# macOS
qlmanage -t -s 1024 -o /tmp/ docs/icon.svg
npx tauri icon /tmp/icon.svg.png
rm /tmp/icon.svg.png

# Linux / 그 외 (librsvg 사용)
rsvg-convert -w 1024 -h 1024 docs/icon.svg -o /tmp/icon.png
npx tauri icon /tmp/icon.png
rm /tmp/icon.png
```

생성 결과:

```text
32x32.png
128x128.png
128x128@2x.png
icon.png
icon.icns      # macOS
icon.ico       # Windows
Square*Logo.png, StoreLogo.png   # Windows Store
```

아이콘 컨셉은 `docs/DESIGN_GUIDE.md` §16 "Icon Guide" 참조.
