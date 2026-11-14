export const OFFICIAL_BASELINE = Object.freeze({
  inspectedAt: "2026-11-13",
  kdesign: {
    repository: "https://github.com/kingdee/kdesign",
    commit: "0189097792acb7379aea32f8b20fad52045f9e28",
    packageVersion: "1.8.74"
  },
  kdesignPro: {
    repository: "https://github.com/kingdee/kdesign-pro",
    commit: "dc769181d12a91e9b7b39845f708b992a24b2844",
    packageVersion: "1.0.0"
  }
});

const component = (id, name, category, exportName = name) => ({
  id,
  name,
  exportName,
  category,
  sourcePath: `components/${id}/demo`
});

export const KDESIGN_COMPONENTS = Object.freeze([
  component("button", "Button", "General"),
  component("clipboard", "Clipboard", "General"),
  component("divider", "Divider", "General"),
  component("icon", "Icon", "General"),
  component("link", "Link", "General"),
  component("space", "Space", "General"),
  component("typography", "Typography", "General"),

  component("grid", "Grid", "Layout", "Row / Col"),
  component("layout", "Layout", "Layout"),
  component("split-panel", "SplitPanel", "Layout"),

  component("anchor", "Anchor", "Navigation"),
  component("breadcrumb", "Breadcrumb", "Navigation"),
  component("menu", "Menu", "Navigation"),
  component("pagination", "Pagination", "Navigation"),
  component("steps", "Steps", "Navigation", "Steps / Step"),
  component("tabs", "Tabs", "Navigation"),

  component("base-data", "BaseData", "Data Entry"),
  component("cascader", "Cascader", "Data Entry"),
  component("checkbox", "Checkbox", "Data Entry"),
  component("city-picker", "CityPicker", "Data Entry"),
  component("color-picker", "ColorPicker", "Data Entry"),
  component("date-picker", "DatePicker", "Data Entry", "DatePicker / RangePicker"),
  component("filter", "Filter", "Data Entry"),
  component("form", "Form", "Data Entry"),
  component("geo-zone-picker", "GeoZonePicker", "Data Entry"),
  component("input", "Input", "Data Entry", "Input / TextArea"),
  component("input-number", "InputNumber", "Data Entry"),
  component("radio", "Radio", "Data Entry"),
  component("rate", "Rate", "Data Entry"),
  component("search", "Search", "Data Entry"),
  component("select", "Select", "Data Entry"),
  component("signature", "Signature", "Data Entry"),
  component("slider", "Slider", "Data Entry"),
  component("stepper", "Stepper", "Data Entry"),
  component("switch", "Switch", "Data Entry"),
  component("transfer", "Transfer", "Data Entry"),
  component("tree-select", "TreeSelect", "Data Entry"),
  component("upload", "Upload", "Data Entry"),

  component("avatar", "Avatar", "Data Display"),
  component("badge", "Badge", "Data Display"),
  component("card", "Card", "Data Display"),
  component("carousel", "Carousel", "Data Display"),
  component("image", "Image", "Data Display"),
  component("image-cropper", "ImageCropper", "Data Display"),
  component("progress", "Progress", "Data Display"),
  component("qr-code", "QRCode", "Data Display"),
  component("svg-icon", "SVG Icon", "Data Display", "@kdcloudjs/kdesign-icons"),
  component("table", "Table", "Data Display"),
  component("tag", "Tag", "Data Display"),
  component("timeline", "Timeline", "Data Display"),
  component("tree", "Tree", "Data Display"),

  component("alert", "Alert", "Feedback"),
  component("collapse", "Collapse", "Feedback"),
  component("drawer", "Drawer", "Feedback"),
  component("dropdown", "Dropdown", "Feedback"),
  component("empty", "Empty", "Feedback"),
  component("message", "Message", "Feedback"),
  component("modal", "Modal", "Feedback"),
  component("notification", "Notification", "Feedback"),
  component("popconfirm", "Popconfirm", "Feedback"),
  component("spin", "Spin", "Feedback"),
  component("tooltip", "Tooltip", "Feedback")
]);

const template = (id, title, category, sourcePath) => ({ id, title, category, sourcePath });

export const KDESIGN_PRO_TEMPLATES = Object.freeze([
  template("workbench", "工作台", "Workbench", "src/pages/typical/workbench/index.tsx"),
  template("detail-basic", "基础详情", "Detail", "src/pages/typical/detail/basic/index.tsx"),
  template("detail-columns", "分栏式详情", "Detail", "src/pages/typical/detail/columns/index.tsx"),
  template("detail-cross", "横向页签详情", "Detail", "src/pages/typical/detail/cross/index.tsx"),
  template("detail-vertical", "纵向导航详情", "Detail", "src/pages/typical/detail/vertical/index.tsx"),
  template("detail-flow", "流程式详情", "Detail", "src/pages/typical/detail/flow/index.tsx"),
  template("list-basic", "基础列表", "List", "src/pages/typical/list/basic/index.tsx"),
  template("list-tree", "左树右表", "List", "src/pages/typical/list/tree/index.tsx"),
  template("list-form", "内嵌表单列表", "List", "src/pages/typical/list/form/index.tsx"),
  template("list-banner", "通栏卡片列表", "List", "src/pages/typical/list/banner/index.tsx"),
  template("list-card", "卡片列表", "List", "src/pages/typical/list/card/index.tsx"),
  template("report-list", "列表报表", "Report", "src/pages/typical/report/list/index.tsx"),
  template("report-statistics", "统计分析类报表", "Report", "src/pages/typical/report/statistics/index.tsx"),
  template("form-basic", "基础表单页", "Form", "src/pages/typical/form/basic/index.tsx"),
  template("form-guide", "向导式表单页", "Form", "src/pages/typical/form/guide/index.tsx"),
  template("form-anchor", "锚点式表单页", "Form", "src/pages/typical/form/anchor/index.tsx"),
  template("form-vertical", "纵向页签表单页", "Form", "src/pages/typical/form/vertical/index.tsx"),
  template("form-preview", "模板预览式表单页", "Form", "src/pages/typical/form/preview/index.tsx"),
  template("exception-403", "403", "Exception", "src/pages/exception/403.tsx"),
  template("exception-404", "404", "Exception", "src/pages/exception/404.tsx"),
  template("exception-500", "500", "Exception", "src/pages/exception/500.tsx"),
  template("login", "登录页", "Login", "src/pages/login/index.tsx")
]);

export const KDESIGN_CATEGORIES = Object.freeze([...new Set(KDESIGN_COMPONENTS.map(({ category }) => category))]);
export const KDESIGN_PRO_CATEGORIES = Object.freeze([...new Set(KDESIGN_PRO_TEMPLATES.map(({ category }) => category))]);
