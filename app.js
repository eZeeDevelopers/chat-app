const express = require("express");
const fs      = require("fs");
const md5 = require('md5');
const app     = express();
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
const io     = require("socket.io")(server);
var Users = [];
var user_messages = [];
io.on("connection", (socket)=>{
    socket.on('user_signup', (data)=>{
        socket.username = data.username;
        let alreadyExist = 0;
        let message = '';
        let temp_user;
        if(Users.length>0){
            console.log(data.email);
            let foundEmail = 0;

            Users.forEach((user) => {
                if (user.email === data.email) {
                    foundEmail = 1;
                }
            });
            console.log('foundEmail'+foundEmail)
            if(foundEmail==0){
                Users.push({username: data.username, password: md5(data.password),userid: socket.id, email: data.email , is_online: 0 , chatting_to: null });
                socket.users = Users;
                temp_user = {username: data.username, password: md5(data.password),userid: socket.id, email: data.email , is_online: 0 , chatting_to: null };
            }else{
                alreadyExist = 1;
                message = 'User already exist with this email address.'
            }
        }else{
            Users.push({username: data.username, password: md5(data.password), userid: socket.id, email: data.email , is_online: 0, chatting_to: null});
            socket.users = Users;
            temp_user = {username: data.username, password: md5(data.password),userid: socket.id, email: data.email , is_online: 0 , chatting_to: null };
        }
        userAddEdit(1,temp_user)
        console.log('socket.users',socket.users);
        io.to(socket.id).emit('chat_start', {message: message, status: alreadyExist});
    });
    socket.on("user_login",(data)=>{
        let is_exist = false;
        let userid  = '';
        Users.forEach((user) => {
            console.log(user)
            if ((user.email == data.email)&&(user.password == md5(data.password))) {
                is_exist = true;
                user.is_online = 1;
                userid = user.userid;
                userAddEdit(0,user)
            }
        });
        console.log('input pass ',md5(data.password))
        console.warn('user_login Users',Users)
        io.to(userid).emit('is_user_loggedin', {loggedin:is_exist , userid: userid});
    })
    socket.on('disconnect', function() {
        let id = socket.id;
        Users.forEach((user) => {
            if (user.userid === id) {
                user.is_online = 0;
                userAddEdit(0,user)
            }
        });
        io.sockets.emit('updated_users_list', {userlist: Users ,myuserid: socket.id});
      });
    socket.on("get_all_users", (data)=>{
        console.warn('get_all_users called',Users)
        console.log('get_all_users called',Users)
        let user = socket.id;
        io.to(user).emit('get_all_users', {userlist: Users ,myuserid: socket.id});
        socket.broadcast.emit('latest_login_user', {userlist: Users});
    })  
    socket.on("new_message", (data)=>{
        let datetime = new Date();
        let hours = datetime.getHours();
        let minutes = datetime.getMinutes();
        let ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        minutes = minutes < 10 ? '0'+minutes : minutes;
        let strTime = hours + ':' + minutes + ' ' + ampm;
        console.log('data.chat_to'+ data.chat_to)
        let chat_to_id = data.chat_to;
        let chatter = data.chatter;
        let is_msg_append = 0;
        if(user_messages.length>0){
            user_messages.forEach((msg) => {
                if (msg.userid === chat_to_id) {
                    let count_msg = parseInt(msg.total_msg);
                    count_msg +=1;
                    msg.total_msg = count_msg;
                    msg.messages.push({msg_text:data.message});
                }
            });
        }else{
            let incomming_msg = [];
            incomming_msg.push({msg_text:data.message});
            user_messages.push({userid: chatter, chatting_to: chat_to_id, total_msg: 1 ,messages: incomming_msg});
        }

        Users.forEach((user) => {
            if ((user.userid === chatter) &&(user.chatting_to === chat_to_id)) {
                is_msg_append = 1;
            }
        });
        io.to(chat_to_id).emit('new_message', {username: socket.username, message: data.message, msgtime: strTime,chatting_to: chat_to_id, onlineusers: socket.users,my_chatting:user_messages, msg_to_be_append:is_msg_append});
    });
    socket.on("get_one_to_one_msg",(data)=>{
        Users.forEach((user) => {
            if ((user.userid === data.sender)) {
                user.chatting_to = data.reciever;
                userAddEdit(0,user)
            }
        });
        console.log('chat to ',Users)
        let my_chat = null;
        if(user_messages.length>0){
            user_messages.forEach((msg) => {
                if ((msg.userid === data.sender)&& (msg.chatting_to===data.reciever)) {
                    my_chat = msg;
                }
            });
        }
        
        io.to(data.sender).emit("get_one_to_one_msg",{chat_msg: my_chat})
    })
    //listen on typing
    socket.on('typing', (data) => {
    	//socket.broadcast.emit('typing', {username : socket.username})
    })
})

function userAddEdit(add = 1,params_data)
{
    if (fs.existsSync(__dirname + '/public/database/Users.json')) {
            fs.readFile(__dirname + '/public/database/Users.json','utf8', function(err,data){
                
                let obj;
                if(data){
                    obj = JSON.parse(data);
                    if(add==1){
                        obj.push(params_data);
                    }else{
                        console.log('params_data',params_data)
                        obj.forEach((index,user) => {
                            if ((user.userid === params_data.userid)) {
                                console.log('params_data.userid',params_data.userid);
                                user.userid = params_data.userid;
                                user.username = params_data.username;
                                user.password = params_data.password;
                                user.email = params_data.email;
                                user.is_online = params_data.is_online;
                                user.chatting_to = params_data.chatting_to;
                                delete obj[index];
                                obj.push(user);
                            }
                        });
                    }
                }else{ 
                    obj = new Array();
                    let user = params_data;
                    obj.push(user);
                }
                
                let strUsers = JSON.stringify(obj);
                fs.writeFile(__dirname + '/public/database/Users.json',strUsers, function(err){
                    if(err){
                        console.log(err)
                    }else{
                        console.log('Registeration Successfully !');
                    }
                });
    
            })
    }else{
        console.log('file not exist.')
    }
}
function createMessagesFile()
{
    //jkkk
}