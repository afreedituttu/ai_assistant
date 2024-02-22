const express = require('express');
const http = require('http');
const OpenAI = require('openai')
const dotenv = require('dotenv')
const bodyParser = require('body-parser')

dotenv.config()
const openai = new OpenAI({apiKey:process.env.OPENAI_KEY})

const port = 3000 || process.env.PORT
const max_tokens = 10

const app = express();
app.use('/', express.static(__dirname));

// my code
const router = express.Router()
async function preConfigGpt(){
    await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages:[{"role":"user","content":"Your name is speak-pal created by mes college of engineering and technology kunnukara"}],
        max_tokens
    })
}
preConfigGpt()
router.get('/log',(req, res)=>{
    console.log('woring');
    res.json({"working":"true"}).status(200)
})
router.post('/answer', async(req, res)=>{
    try{
        console.log(req.body);
        const {question} = req.body;
        if(!question){
            return res.json({success:false}).status(404)
        }
        console.log(question);
        
        const result = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages:[{"role":"user","content":question}],
            max_tokens
        })
        console.log(result);
        console.log(result["choices"][0].message.content);
        res.json({success:true,result:result["choices"][0].message.content}).status(200)
    }catch(error){
        console.log(error);
        res.json({'success':'false'}).status(500)
    }
})


app.use(bodyParser.urlencoded({extended:true}))
app.use(express.json())
app.use(router)
const server = http.createServer(app);
server.listen(port, () => console.log(`Server started on port localhost:${port}`));
