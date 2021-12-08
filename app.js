const express = require("express");
const fs      = require("fs");
const app     = express();
// get the file descriptor of the file
const fd = fs.openSync(__dirname + '/public/database/Users.json', 'r+');
app.use(express.static(__dirname + '/public'));
app.get("/",function(req, res){
    res.sendFile(__dirname+"/index.html");
});
app.get("/video",function(req, res){
    const range = req.headers.range;
    if(!range){
        res.status('400').send("Requiured range header");
    }
    const video_path = 'bigbuck.mp4';
    const video_size = fs.statSync('bigbuck.mp4').size;
    const CHUNK_SIZE = 10 ** 6;// 1MB
    const start      = Number(range.replace(/\D/g, ""));
    const end        = Math.min(start+CHUNK_SIZE, video_size-1);
    const content_length = end-start+1;
    const headers = {
        "Content-Range": `bytes ${start}-${end}/${video_size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": content_length,
        "Content-Type": "video/mp4"
    };
    res.writeHead(206, headers);
    const video_stream = fs.createReadStream(video_path, {start, end});
    video_stream.pipe(res); 
});

const server = app.listen(5000,()=>{
    console.log('Listening port 5000 ')
});