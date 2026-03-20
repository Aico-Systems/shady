import { mount } from "svelte";
import App from "./App.svelte";
import "@aico/blueprint/blueprint.css";
import "./app.css";
import { initI18n } from "./i18n";

initI18n();

const app = mount(App, {
	target: document.getElementById("app")!,
});

export default app;
