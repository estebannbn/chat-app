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

// tiene ON DELETE CASCADE por la cuestion de los default users
// podria cambiarlos si quisiera usar una DB preexistente, con usuarios diferentes
pool.execute(`CREATE TABLE IF NOT EXISTS messages(
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    content TEXT,
    user_id INTEGER,
    CONSTRAINT FK_user_message FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
)`)

// Si el constraint en FK_user_message fuese ON DELETE RESTRICT, fallaria la app
DEFAULT_USERS.forEach( (user,i) => {
    i=i+1
    pool.execute(`INSERT IGNORE INTO users (id,name,password) VALUES (?,?,?)`,[i,user.name,user.password])
} )


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
        const [rows] = await pool.query(`SELECT * FROM users WHERE name = ?`,[username])
        const userId = rows[0].id
        try {
            result = await pool.query(`INSERT INTO messages (content,user_id) VALUES (?,?)`,[msg,userId])
        } catch (error) {
            console.log('error in chat message',error)
            return
        }
        io.emit('chat message',msg,undefined,username)
    })
    if(!socket.recovered){
        try {
            const {serverOffset} = socket.handshake.auth
            const msgResult = await pool.query('SELECT id, content, user_id FROM messages WHERE id > ? ORDER BY id DESC',[serverOffset ?? 0])
            const savedMessages = msgResult[0]
            savedMessages.forEach( async(msgRow) => {
                const [rows] = await pool.query('SELECT name FROM users WHERE id = ?',[msgRow.user_id])
                const username = rows[0].name
                console.log('row id ', msgRow.id)
                socket.emit('chat message',msgRow.content,msgRow.id,username)
            })
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