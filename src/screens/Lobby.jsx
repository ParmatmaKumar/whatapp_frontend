import React, { useCallback, useEffect } from 'react'
import { useState } from 'react'
import { useSocket } from '../context/SocketProvider'
import { useNavigate } from 'react-router-dom'

export const Lobby = () => {
  const [email, setEmail] = useState('')
  const [room, setRoom] = useState('')
  const navigate = useNavigate()

  const socket = useSocket();

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    // Handle form submission logic here
    socket.emit('joinRoom', { email, room });
    console.log('Email:', email)
    console.log('Room:', room)
  }, [email,room,socket]);

  const handleJoinRoom = useCallback((data) => {
     const { email, room } = data;
        // console.log(`${email} joined room ${room}`);
        navigate(`/room/${room}`);
  },[]);

  useEffect(()=>{
    socket.on("joinRoom", handleJoinRoom);
    return () => {
        socket.off("joinRoom", handleJoinRoom);
    }
  },[handleJoinRoom,socket])

  return (
    <div className='flex flex-col items-center justify-center text-2xl gap-5 bg-black text-white h-screen w-screen'>
        <h1>Lobby</h1>
        <form className='flex flex-col gap-5' onSubmit={handleSubmit}>
            <input
                type="email"
                placeholder='Enter Your Email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className='p-3 rounded-md border-2 border-gray-500'
            />
            <input
                type="text"
                placeholder='Enter Room ID'
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                className='p-3 rounded-md border-2 border-gray-500'
            />

            <button className='p-3 bg-blue-500 text-white rounded-md hover:bg-blue-600' type='submit'>
                Join Room
            </button>
        </form>
    </div>
  )
}
