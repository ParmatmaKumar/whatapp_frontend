// Import React and required hooks
import React, { useCallback, useEffect, useState } from 'react'

// Custom hook to access socket instance from context
import { useSocket } from '../context/SocketProvider'

// Peer connection service (WebRTC wrapper)
import peer from '../service/peer';

// Main Room component
export const Room = () => {

    // Get socket instance
    const socket = useSocket();

    // Store remote user's socket ID
    const [remoteSocetId, setRemoteSocketId] = useState(null);

    // Store local media stream (your video/audio)
    const [myStream, setMyStream] = useState(null);

    // Store remote user's stream
    const [remoteStream, setRemoteStream] = useState(null);

    // When a new user joins the room
    const handleUserJoin = useCallback(({ email, id }) => {
        console.log(`${email} joined the room.`); // log user join
        setRemoteSocketId(id); // save their socket ID
    }, []);

    // Add media tracks (audio/video) to peer connection
    const addTracksToPeer = useCallback((stream) => {
        if (!stream) return; // safety check

        // Loop through all tracks in the stream
        for (const track of stream.getTracks()) {

            // Check if track already added (avoid duplicates)
            const exists = peer.peer.getSenders().some(sender => sender.track === track);

            // If not already added → add track to peer connection
            if (!exists) {
                peer.peer.addTrack(track, stream);
            }
        }
    }, []);

    // Trigger renegotiation when new tracks are added
    const doRenegotiate = useCallback(async () => {
        if (!remoteSocetId) return; // no user to send offer

        const offer = await peer.createOffer(); // create new SDP offer

        // Send offer to remote user
        socket.emit("peer-negotiation-needed", { offer, to: remoteSocetId });
    }, [remoteSocetId, socket]);

    // When user clicks "Call"
    const handleCallUser = useCallback(async () => {

        // Get camera + mic access
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

        setMyStream(stream); // save local stream

        addTracksToPeer(stream); // add tracks to peer connection

        const offer = await peer.createOffer(); // create offer

        // Send call request to remote user
        socket.emit("callUser", { to: remoteSocetId, offer });
    }, [remoteSocetId, socket, addTracksToPeer]);

    // When receiving an incoming call
    const handleincommingCall = useCallback(async ({ from, offer }) => {

        setRemoteSocketId(from); // store caller ID

        // Get local media
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

        setMyStream(stream); // save local stream

        addTracksToPeer(stream); // add tracks

        // Create answer for received offer
        const answer = await peer.getAnswer(offer);

        // Send answer back to caller
        socket.emit("callAccepted", { to: from, answer });
    }, [socket, addTracksToPeer]);

    // Send streams manually (after call setup)
    const sendStreams = useCallback(async () => {
        if (!myStream) return;

        addTracksToPeer(myStream); // ensure tracks added

        await doRenegotiate(); // renegotiate connection
    }, [myStream, addTracksToPeer, doRenegotiate]);

    // When call is accepted by remote user
    const handleCallAccepted = useCallback(({ answer }) => {
        peer.setRemoteDescription(answer); // set remote SDP
        console.log("Call accepted !");
    }, []);

    // Handle negotiation request from remote peer
    const handleNegotiationIncoming = useCallback(async ({ from, offer }) => {

        const answer = await peer.getAnswer(offer); // create answer

        // Send back answer
        socket.emit("peer-negotiation-done", { to: from, answer });
    }, [socket]);

    // Final step of negotiation
    const handleNegotiationFinal = useCallback(async ({ answer }) => {
        await peer.setRemoteDescription(answer); // finalize connection
    }, []);

    // Listen for incoming media tracks (remote video/audio)
    useEffect(() => {
        peer.peer.addEventListener("track", async (event) => {
            console.log("Track event received:", event);

            const remoteStream = event.streams; // get streams

            setRemoteStream(remoteStream[0]); // store first stream
        });
    }, [])

    // Socket event listeners setup
    useEffect(() => {

        socket.on("userJoin", handleUserJoin); // user joined
        socket.on("incommingCall", handleincommingCall); // incoming call
        socket.on("callAccepted", handleCallAccepted); // call accepted
        socket.on("peer-negotiation-needed", handleNegotiationIncoming); // renegotiation start
        socket.on("peer-negotiation-final", handleNegotiationFinal); // renegotiation end

        // Cleanup listeners on unmount
        return () => {
            socket.off("userJoin", handleUserJoin);
            socket.off("incommingCall", handleincommingCall);
            socket.off("callAccepted", handleCallAccepted);
            socket.off("peer-negotiation-needed", handleNegotiationIncoming);
            socket.off("peer-negotiation-final", handleNegotiationFinal);
        }

    }, [socket, handleUserJoin, handleincommingCall, handleCallAccepted, handleNegotiationIncoming, handleNegotiationFinal]);

    // UI Rendering
    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">

            {/* Main card container */}
            <div className="bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-3xl flex flex-col items-center gap-4">

                {/* Title */}
                <h1 className="text-2xl font-bold">Video Room</h1>

                {/* Connection status */}
                <h4 className={`text-sm font-medium ${remoteSocetId ? "text-green-400" : "text-red-400"}`}>
                    {remoteSocetId ? "Connected" : "No one in room"}
                </h4>

                {/* Action buttons */}
                <div className="flex gap-3 mt-2">

                    {/* Call button */}
                    {remoteSocetId && (
                        <button
                            onClick={handleCallUser}
                            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition"
                        >
                            📞 Call
                        </button>
                    )}

                    {/* Send stream button */}
                    {myStream && (
                        <button
                            onClick={sendStreams}
                            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-medium transition"
                        >
                            🚀 Send Stream
                        </button>
                    )}
                </div>

                {/* Video display section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-4">

                    {/* Local video */}
                    {myStream && (
                        <div className="bg-black rounded-xl overflow-hidden border border-gray-700 p-2 flex flex-col items-center">
                            <h2 className="text-sm mb-2 text-gray-300">My Video</h2>

                            <video
                                autoPlay
                                muted // prevent echo
                                className="rounded-lg w-full h-48 object-cover"
                                ref={(video) => {
                                    if (video) video.srcObject = myStream; // attach stream
                                }}
                            />
                        </div>
                    )}

                    {/* Remote video */}
                    {remoteStream && (
                        <div className="bg-black rounded-xl overflow-hidden border border-gray-700 p-2 flex flex-col items-center">
                            <h2 className="text-sm mb-2 text-gray-300">Remote Video</h2>

                            <video
                                autoPlay
                                className="rounded-lg w-full h-48 object-cover"
                                ref={(video) => {
                                    if (video) video.srcObject = remoteStream; // attach remote stream
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}