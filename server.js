const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;

const API_KEY = "IIIIIIIVVVIVIIVIIIIX";

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


const FILE = "./states.json";


function loadStates(){

    if(!fs.existsSync(FILE)){
        const init = {
            gpio26:"off",
            gpio27:"off"
        };

        fs.writeFileSync(FILE, JSON.stringify(init));
        return init;
    }


    return JSON.parse(
        fs.readFileSync(FILE)
    );

}


function saveStates(data){

    fs.writeFileSync(
        FILE,
        JSON.stringify(data)
    );

}



// =========================
// ESP32 LECTURE ETATS
// =========================

app.get("/api", (req,res)=>{

    res.json(
        loadStates()
    );

});



// =========================
// BOT WHATSAPP MODIFICATION
// =========================

app.post("/api",(req,res)=>{


    const key=req.body.key;


    if(key !== API_KEY){

        return res.status(401).json({
            error:"Unauthorized"
        });

    }


    const pin=req.body.pin;
    const state=req.body.state;


    if(
        !["gpio26","gpio27"].includes(pin)
        ||
        !["on","off"].includes(state)
    ){

        return res.status(400).json({
            error:"Invalid command"
        });

    }


    let states=loadStates();


    states[pin]=state;


    saveStates(states);



    res.json({

        success:true,
        pin,
        state,
        all:states

    });


});



app.listen(PORT,()=>{

console.log(
`API SmartHome démarrée sur port ${PORT}`
);

});