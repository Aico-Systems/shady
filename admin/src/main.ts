import { mount } from "svelte";
import App from "./App.svelte";
import "@aico/blueprint/blueprint.css";
import "./app.css";
import { initI18n } from "./i18n";
import { themeStore } from "@aico/blueprint";

initI18n();
themeStore.init();

const app = mount(App, {
	target: document.getElementById("app")!,
});

export default app;
