# RuliCon

아직 Alpha도 아닌 Develop 단계

## 빌드

댓글 아이콘 선택 UI는 Preact를 사용합니다. WXT와 Userscript의 Vite 설정에
`@preact/preset-vite`를 연결하고, TypeScript JSX runtime은 `preact`로 지정합니다.
MAIN world에서 페이지의 댓글 기능과 연동하므로 Preact DevTools와 Prefresh는 비활성화합니다.
열린 댓글/답글 패널과 저장 설정은 하나의 앱에서 관리하며, 패널·프리셋 목록·다이얼로그는
hooks로 상태를 관리합니다. 루리웹의 기존 댓글 영역에는 portal로 UI를 표시합니다.

```sh
bun install
bun run build             # Chrome MV3: .output/chrome-mv3/
bun run build:userscript  # Userscript: .output/userscript/rulicon.user.js
bun run test:userscript   # 빌드 결과 및 시작 동작 검사
```

Userscript는 생성된 `rulicon.user.js` 내용을 Tampermonkey의 새 스크립트 편집기에
붙여 넣고 저장하면 설치됩니다. JS와 CSS가 한 파일에 포함되며, 확장과 같은
루리웹 아이콘 게시판 글쓰기·수정 URL에서 기존 편집기 기능을 실행합니다.
페이지의 `seditor`와 jQuery에 접근하기 위해 `@grant none`과 `@sandbox raw`를 사용합니다.
확장과 userscript를 동시에 활성화하지 마세요.

빌드 방식: [Vite library mode](https://vite.dev/guide/build#library-mode),
실행 설정: [Tampermonkey metadata](https://www.tampermonkey.net/documentation.php).
