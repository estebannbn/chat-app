import express from 'express'
import logger from 'morgan'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import { Server } from 'socket.io'
import { createServer } from 'http'

dotenv.config()

const DB_HOST = process.env.DB_HOST || 'localhost',
    DB_USER = process.env.DB_USER || 'root',
    DB_PASSWORD = process.env.DB_PASSWORD || 'example',
    DATABASE = process.env.DATABASE || 'chatdb'

const pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DATABASE
})

export const DEFAULT_USERS = [
    {name:'esteban',password:'hola'},
    {name:'maria',password:'123'},
    {name:'raul',password:'pass'}
]

pool.execute(`CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    name TEXT,
    password TEXT
)`)
pool.execute(`CREATE TABLE IF NOT EXISTS messages(
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    content TEXT,
    user_id INTEGER,
    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
)`)

DEFAULT_USERS.forEach( (user,i) => pool.execute(`REPLACE INTO users (id,name,password) VALUES (?,?,?)`,[i,user.name,user.password]) )




const PORT = process.env.PORT || 3001
const app = express()
const server = createServer(app)
const io = new Server(server)

io.on('connection',async(socket)=>{
    console.log('an user has connected!')
    socket.on('disconnect',()=>{
        console.log('an user has disconnect')
    })
    socket.on('chat message',async(msg)=>{
        let result
        const {username} = socket.handshake.auth
        console.log({username})
        const userId = await pool.query(`SELECT id FROM users WHERE name=?`,[username])
        console.log('user id: ' + userId[0])
        try {
            result = await pool.query(`INSERT INTO messages (content,user_id) VALUES (?,?)`,[msg,userId])
            console.log({result})
        } catch (error) {
            console.log('error in chat message',error)
            return
        }
        io.emit('chat message',msg)
    })
    console.log('auth')
    console.log(socket.handshake.auth)
    if(!socket.recovered){
        try {
            const result = await pool.query('SELECT id, content FROM messages WHERE id > ?',[socket.handshake.auth.serverOffser ?? 0])
            const savedMessages = result[0]
            savedMessages.forEach( row => socket.emit('chat message',row.content,row.id) )
        } catch (error) {
            console.log({error})
            return
        }
    }
})

app.use(logger('dev'))

app.get('/',(req,res)=>{
    console.log(`current directory: ${process.cwd()}`)
    res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(PORT, ()=>console.log(`listening at http://localhost:${PORT}`))