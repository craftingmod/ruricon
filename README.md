# RuliCon

아직 Alpha도 아닌 Develop 단계

## Install

[Userscript](https://cdn.jsdelivr.net/gh/craftingmod/rulicon@userscript/rulicon.user.js)

`bun run build:userscript`는 `.output/userscript/rulicon.user.js`와 메타데이터만 담은
`rulicon.meta.js`를 생성합니다. `v*` 태그 릴리스 시 두 파일을 `userscript` 고립 브랜치에
커밋하며, `@updateURL`은 `.meta.js`, `@downloadURL`은 `.user.js`를 가리킵니다.
