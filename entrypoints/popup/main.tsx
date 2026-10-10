import { render } from "preact"

import "./style.css"
import Logo from "@/assets/ruricon.svg"

function App() {
  return (
    <div className="flex-ver">
      <a href="https://github.com/craftingmod/ruricon" target="_blank">
        <img src={Logo} class="logo project" alt="Project logo" />
      </a>
      <h1>Ruricon</h1>
      <p class="read-the-docs">Ruliweb icon extension</p>
      <p>Version: v0.0.1-dev</p>
    </div>
  )
}

render(<App />, document.querySelector<HTMLDivElement>("#app")!)
