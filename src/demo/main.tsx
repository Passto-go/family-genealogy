import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "../index.css"
import "../styles/print.css"
import "../styles/sushi.css"
import App from "../App"
import { demoData } from "./data"
import { DemoBadge } from "./DemoBadge"
import { installDemoApi } from "./mock-api"

/* 先接管 fetch，再挂载应用，保证首屏请求也落在演示数据上 */
installDemoApi(demoData)

/* 路由基址与构建 base 对齐（/family-genealogy/ → /family-genealogy），子路径部署下刷新才不丢路由 */
const basename = import.meta.env.BASE_URL.replace(/\/+$/, "")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
    <DemoBadge />
  </StrictMode>,
)
