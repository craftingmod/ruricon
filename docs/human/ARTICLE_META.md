## 메타데이터 삽입

게시글 맨 위에

```html
<div
  data-meta="ruricon:v1"
  contenteditable="false"
  style="
    border: 1px solid #7fa5d8;
    border-radius: 9px;
    background: #f1f4f8;
    padding: 18px;
    margin: 12px 0;
    color: #333;
    font-size: 14px;
    line-height: 1.6;
  "
>
  <div
    style="
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    "
  >
    <span style="font-size: 17px;">😙</span>
    <strong style="font-size: 17px; font-weight: 500;">
      아이콘 묶음
    </strong>
    <span
      style="
        margin-left: auto;
        font-size: 13px;
        color: #777;
      "
    >
      읽기 전용
    </span>
  </div>
  <div
    data-meta="ruricon-pages"
    style="
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    "
  >
    <span style="color: #777;">페이지</span>
    <a
      href="/community/board/98/read/2678"
      style="display:inline-block; padding: 7px 15px; border:1px solid #ddd; border-radius:6px; background:#fff; color:#333; text-decoration:none;"
    >1</a>
    <a
      href="/community/board/98/read/2679"
      style="display:inline-block; padding: 7px 15px; border:1px solid #ddd; border-radius:6px; background:#fff; color:#333; text-decoration:none;"
    >2</a>
    <a
      href="/community/board/98/read/2680"
      style="display:inline-block; padding: 7px 15px; border:1px solid #ddd; border-radius:6px; background:#fff; color:#333; text-decoration:none;"
    >3</a>
    <a
      href="/community/board/98/read/2681"
      style="display:inline-block; padding: 7px 15px; border:1px solid #ddd; border-radius:6px; background:#fff; color:#333; text-decoration:none;"
    >4</a>
  </div>
  <div style="color: #777; font-size: 13px;">
    실제 아이콘은 위 세부 페이지를 확인해주세요.
  </div>
</div>
<hr>
<p><br></p>
```

## 아이콘 삽입
```html
<p style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; border: 2px solid Grey; background-color: White; padding: 2px; box-sizing: border-box;">
<img src="..." alt="1">
</p>
```

## Main / Slave 상태 계약

- Main은 세트 구성의 유일한 원본이다. Slave는 Main으로 가는 링크와 상태의 이미지 URL 목록으로 생성한 grid를 게시한다. 링크 주소는 `/community/board/98/read/{Main ID}`이며 게시할 때 생성한다. 링크는 상태의 이미지 목록이나 편집용 grid에 포함하지 않는다.
- Main 사용자 본문은 상태에 넣지 않는다. 컴파일은 맨 위의 `data-meta="ruricon:v1"` 블록만 교체하며 그 아래 HTML 원문을 보존한다. 별도 구분선도 자동 삽입하지 않는다.
- `ruricon-pages`는 사람 및 DOM 클라이언트를 위한 링크 출력이다. 게시글 ID가 있는 Slave만 상태 배열 순서대로 표시한다.
- 같은 블록 안의 `<div data-meta="ruricon-state" style="display:none">…</div>`에 상태를 textContent로 넣는다. 인코딩은 JSON → UTF-8 → base64url이며 `=` 패딩은 생략한다.

```ts
interface IconSetState {
  version: 1
  name: string
  boardId: number
  mainArticleId: number | null
  slaves: {
    page: number
    articleId: number | null
    images: string[]
  }[]
}
```

`images`는 HTTP(S) 이미지 URL이며 순서와 중복을 보존한다. 페이지당 100개까지 저장한다. `articleId: null`은 미게시 페이지다. Main HTML, 편집기 DOM, 활성 페이지, 진행 메시지는 JSON에 포함하지 않는다.

세트명은 편집 중 최대 38자다. 제목 접미사는 게시 시에만 생성한다.

- Main: `세트명 (M)`
- Slave: `세트명 (S{Main ID의 대문자 base36})`

Slave 제목에는 페이지 번호를 넣지 않는다. 페이지 순서는 Main 상태와 페이지 링크로 관리한다. 기존 번호가 붙은 제목도 읽을 수 있다.

최종 제목도 45자 이하인지 검사하며 자동으로 이름을 자르지 않는다. Main ID 확보 후 실제 Slave 제목 길이를 다시 검사한다.

## 같은 화면에서 게시

`세트 게시` 버튼은 현재 편집 내용을 snapshot으로 고정하고 기존 `writeArticle`을 순차 호출한다. 편집기 본문이나 활성 페이지를 게시용으로 전환하지 않는다.

1. Main ID가 없으면 사용자 본문과 초기 메타데이터로 Main을 write한다. 응답의 게시글 URL에서 ID를 얻는다.
2. 각 Slave를 게시한다. ID가 이미 있으면 modify한다.
3. 성공한 ID를 Controller에 즉시 보관한다.
4. 최신 ID로 메타데이터를 다시 만들고 Main을 modify한다. 이 요청까지 성공하면 완료다.

새 글 생성 요청은 직전 생성 요청의 응답 처리 완료 후 최소 35초(서버 제한 30초 + 여유 5초)를 기다린다. 수정은 대기하지 않으며 생성 대기 시간을 초기화하지 않는다. 실패한 생성 요청 뒤에도 간격을 유지하고, 같은 화면에서 재시도해도 대기 시간이 유지된다. 대기 중 대상 페이지와 남은 초를 표시한다. 최초 생성은 이 화면에서 기록한 이전 생성 요청이 없으면 즉시 실행한다. 다른 탭이나 일반 글쓰기의 생성 시간은 추적하지 않는다.

게시 중 입력과 페이지 전환을 잠근다. 일반 form submit은 세트 게시로 안내한다. 저장 후 GET 재조회 검증은 하지 않는다.

명시적 실패 후 같은 화면에서 재시도하면 이미 생성된 글은 수정한다. 네트워크 오류 또는 ID를 확인할 수 없는 성공 응답은 생성 여부가 불명확하므로 자동 재시도를 차단한다. 게시판을 확인한 뒤 Main 수정 화면에서 이어간다.

Main 수정 URL의 ID가 있으면 저장된 ID와 대조하고 init을 생략한다. 다음 편집 진입 시 상태를 검증하고 Slave grid를 복원한다. 중복/잘못 배치된 메타데이터, 깨진 상태, 미지원 버전은 빈 세트로 초기화하지 않는다. 메타데이터가 없는 기존 Main은 기존 본문으로 시작한다. Slave 편집 화면에서는 Main 편집 링크로 안내하고 세트 편집/게시를 비활성화한다.

초안과 중간 게시 진행 정보는 메모리에만 보관한다. 최종 Main 갱신 전 새로고침하면 아직 Main에 반영되지 않은 Slave ID를 잃을 수 있다. 서버의 숨김 요소 및 data-meta 보존 여부는 실제 사이트 검증 대상이다.

## 로컬 검증

Vite 개발 서버에서 `/tests/icon-upload.html`과 `/tests/article-meta.html`을 연다. 후자는 fetch를 모의 처리하여 외부 게시 없이 상태 왕복, 사용자 HTML 보존, 재편집 복원, 부분 실패 재시도, 편집 잠금, 응답 유실 시 재게시 차단을 검사한다.
