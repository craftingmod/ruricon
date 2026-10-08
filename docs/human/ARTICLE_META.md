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