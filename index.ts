import { AppController } from "@/app/AppController";

const app = new AppController();

await app.init();

console.log("App initialized");

const res = app.selectModel("openrouter", "google/gemma-4-31b-it:free");
console.log(res);
console.log("Selected model:", app.getSelectedModel()?.model);
