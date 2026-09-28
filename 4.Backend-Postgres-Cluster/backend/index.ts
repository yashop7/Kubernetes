import express, { type Request, type Response } from "express"
const app = express();
const PORT = process.env.PORT ?? 3000;
app.use(express.json());

app.get("/",(req : Request, res : Response) => {
    
})

app.listen(PORT, () => {
    console.log("Listening on port", PORT);
})