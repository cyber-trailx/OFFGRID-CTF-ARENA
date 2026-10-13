import dotenv from "dotenv";
dotenv.config({ path: "../.env" });
import { app } from "./app.js";
const port=Number(process.env.PORT||4000);
app.listen(port,()=>console.log(`OFFGRID API listening on http://localhost:${port}`));
