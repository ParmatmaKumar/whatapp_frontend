// Import React and required hooks
import React, { useCallback, useEffect, useState, useRef } from 'react'

// Custom hook to access socket instance from context
import { useSocket } from '../context/SocketProvider'

// Peer connection service (WebRTC wrapper)
import peer from '../service/peer';

// Navigation hook
import { useNavigate } from 'react-router-dom';

// Main Room component
export const Room = () => {

    // Get socket instance
    const socket = useSocket();

    // Navigation hook
    const navigate = useNavigate();

    // Create refs for video elements
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);

    // Store remote user's socket ID
    const [remoteSocetId, setRemoteSocketId] = useState(null);

    // Store local media stream (your video/audio)
    const [myStream, setMyStream] = useState(null);

    // Store remote user's stream
    const [remoteStream, setRemoteStream] = useState(null);

    // Store all remote streams for debugging
    const [allRemoteStreams, setAllRemoteStreams] = useState([]);

    // Mute state
    const [isMuted, setIsMuted] = useState(false);

    // Screen sharing state
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [screenStream, setScreenStream] = useState(null);

    // Video devices
    const [videoDevices, setVideoDevices] = useState([]);

    // Current camera
    const [currentCamera, setCurrentCamera] = useState(null);

    // Handle incoming remote track events
    const handleTrackEvent = useCallback((event) => {
        const hasRemoteStream = event.streams && event.streams.length > 0;

        let incomingStream;
        if (hasRemoteStream) {
            incomingStream = event.streams[0];
        } else {
            incomingStream = new MediaStream([event.track]);
        }

        setAllRemoteStreams(hasRemoteStream ? event.streams : [incomingStream]);
        setRemoteStream(incomingStream);

        console.log("Remote track event:", event);
        console.log("Remote stream id:", incomingStream.id);
    }, []);

    // Handle ICE candidate from local peer
    const handleLocalIceCandidate = useCallback((candidate) => {
        if (!remoteSocetId || !candidate) return;
        socket.emit("ice-candidate", { to: remoteSocetId, candidate });
    }, [remoteSocetId, socket]);

    // Wire peer callbacks (track + ice candidate)
    const setupPeerEventHandlers = useCallback(() => {
        peer.onTrack(handleTrackEvent);
        peer.onIceCandidate(handleLocalIceCandidate);
    }, [handleTrackEvent, handleLocalIceCandidate]);

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

        // Only renegotiate if connection is stable (ready for new offer)
        if (peer.peer.signalingState === 'stable') {
            const offer = await peer.createOffer(); // create new SDP offer

            // Send offer to remote user
            socket.emit("peer-negotiation-needed", { offer, to: remoteSocetId });
        } else {
            console.log("Connection not stable, skipping renegotiation. State:", peer.peer.signalingState);
        }
    }, [remoteSocetId, socket]);

    // When user clicks "Call"
    const handleCallUser = useCallback(async () => {
        try {
            // Reset peer connection for new call
            peer.resetPeerConnection();
            setupPeerEventHandlers();

            // Get camera + mic access
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

            setMyStream(stream); // save local stream

            addTracksToPeer(stream); // add tracks to peer connection

            const offer = await peer.createOffer(); // create offer

            // Send call request to remote user
            socket.emit("callUser", { to: remoteSocetId, offer });
        } catch (error) {
            console.error("Error initiating call:", error);
        }
    }, [remoteSocetId, socket, addTracksToPeer]);

    // When receiving an incoming call
    const handleincommingCall = useCallback(async ({ from, offer }) => {
        try {
            setRemoteSocketId(from); // store caller ID

            // Reset peer connection for new call
            peer.resetPeerConnection();
            setupPeerEventHandlers();

            // Get local media
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

            setMyStream(stream); // save local stream

            addTracksToPeer(stream); // add tracks

            // Create answer for received offer
            const answer = await peer.getAnswer(offer);

            // Send answer back to caller
            socket.emit("callAccepted", { to: from, answer });
        } catch (error) {
            console.error("Error handling incoming call:", error);
        }
    }, [socket, addTracksToPeer]);

    // Send streams manually (after call setup)
    const sendStreams = useCallback(async () => {
        if (!myStream) return;

        try {
            addTracksToPeer(myStream); // ensure tracks added
            await doRenegotiate(); // renegotiate connection
        } catch (error) {
            console.error("Error sending streams:", error);
        }
    }, [myStream, addTracksToPeer, doRenegotiate]);

    // When call is accepted by remote user
    const handleCallAccepted = useCallback(async ({ answer }) => {
        try {
            await peer.setRemoteDescription(answer); // set remote SDP
            console.log("Call accepted !");

            // Automatically send streams after call setup
            await sendStreams();
        } catch (error) {
            console.error("Error setting remote description:", error);
        }
    }, [sendStreams]);

    // Handle negotiation request from remote peer
    const handleNegotiationIncoming = useCallback(async ({ from, offer }) => {
        try {
            const answer = await peer.getAnswer(offer); // create answer

            // Send back answer
            socket.emit("peer-negotiation-done", { to: from, answer });
        } catch (error) {
            console.error("Error handling negotiation:", error);
        }
    }, [socket]);

    // Final step of negotiation
    const handleNegotiationFinal = useCallback(async ({ answer }) => {
        try {
            // Only set remote description if not already stable
            if (peer.peer.signalingState !== 'stable') {
                await peer.setRemoteDescription(answer); // finalize connection
                console.log("Negotiation complete");
            } else {
                console.log("Connection already stable, skipping remote description set");
            }
        } catch (error) {
            console.error("Error finalizing negotiation:", error);
        }
    }, []);

    // Toggle mute
    const toggleMute = useCallback(() => {
        if (myStream) {
            myStream.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            setIsMuted(!isMuted);
        }
    }, [myStream, isMuted]);

    // Share screen
    const shareScreen = useCallback(async () => {
        if (isScreenSharing) {
            // Stop screen sharing
            if (screenStream) {
                screenStream.getTracks().forEach(track => track.stop());
                setScreenStream(null);
            }

            // Switch back to camera
            if (myStream) {
                const videoTrack = myStream.getVideoTracks()[0];
                const sender = peer.peer.getSenders().find(s => s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(videoTrack);
                }
            }

            setIsScreenSharing(false);
            await doRenegotiate();
        } else {
            // Start screen sharing
            try {
                const newScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                setScreenStream(newScreenStream);

                const screenVideoTrack = newScreenStream.getVideoTracks()[0];
                
                // Listen for when screen sharing ends
                screenVideoTrack.addEventListener('ended', () => {
                    setIsScreenSharing(false);
                    setScreenStream(null);
                    // Switch back to camera
                    if (myStream) {
                        const videoTrack = myStream.getVideoTracks()[0];
                        const sender = peer.peer.getSenders().find(s => s.track.kind === 'video');
                        if (sender) {
                            sender.replaceTrack(videoTrack);
                        }
                    }
                    doRenegotiate();
                });

                const sender = peer.peer.getSenders().find(s => s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(screenVideoTrack);
                } else {
                    peer.peer.addTrack(screenVideoTrack, newScreenStream);
                }

                setIsScreenSharing(true);
                await doRenegotiate();
            } catch (error) {
                console.error("Error sharing screen:", error);
            }
        }
    }, [isScreenSharing, screenStream, myStream, doRenegotiate]);

    // Switch camera
    const switchCamera = useCallback(async () => {
        if (videoDevices.length < 2) return;
        const currentIndex = videoDevices.findIndex(d => d.deviceId === currentCamera);
        const nextIndex = (currentIndex + 1) % videoDevices.length;
        const nextDeviceId = videoDevices[nextIndex].deviceId;
        setCurrentCamera(nextDeviceId);

        if (myStream) {
            myStream.getTracks().forEach(track => track.stop());
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: nextDeviceId } },
            audio: true
        });
        setMyStream(newStream);

        const videoTrack = newStream.getVideoTracks()[0];
        const sender = peer.peer.getSenders().find(s => s.track.kind === 'video');
        if (sender) {
            sender.replaceTrack(videoTrack);
        }

        await doRenegotiate();
    }, [videoDevices, currentCamera, myStream, doRenegotiate]);
    // End connection
    const endConnection = useCallback(() => {
        // Stop all local streams
        if (myStream) {
            myStream.getTracks().forEach(track => track.stop());
            setMyStream(null);
        }

        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
            setScreenStream(null);
        }

        // Close peer connection
        if (peer.peer) {
            peer.resetPeerConnection();
        }

        // Reset state
        setRemoteSocketId(null);
        setRemoteStream(null);
        setIsMuted(false);
        setIsScreenSharing(false);
        setVideoDevices([]);
        setCurrentCamera(null);

        // Notify remote user
        if (remoteSocetId) {
            socket.emit("endCall", { to: remoteSocetId });
        }

        // Navigate back to lobby
        navigate('/');
    }, [myStream, screenStream, remoteSocetId, socket, navigate]);

    useEffect(() => {
        setupPeerEventHandlers();

        socket.on("ice-candidate", async ({ candidate }) => {
            try {
                if (candidate) {
                    await peer.addIceCandidate(candidate);
                }
            } catch (error) {
                console.error("Error adding remote ICE candidate:", error);
            }
        });

        return () => {
            socket.off("ice-candidate");
        };
    }, [setupPeerEventHandlers, socket]);

    // Update video elements when streams change
    useEffect(() => {
        if (localVideoRef.current && myStream) {
            localVideoRef.current.srcObject = myStream;
        }
    }, [myStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // Enumerate video devices
    useEffect(() => {
        if (myStream) {
            navigator.mediaDevices.enumerateDevices().then(devices => {
                const videoInputs = devices.filter(device => device.kind === 'videoinput');
                setVideoDevices(videoInputs);
                if (videoInputs.length > 0 && !currentCamera) {
                    setCurrentCamera(videoInputs[0].deviceId);
                }
            });
        }
    }, [myStream, currentCamera]);

    // Socket event listeners setup
    useEffect(() => {

        socket.on("userJoin", handleUserJoin); // user joined
        socket.on("incommingCall", handleincommingCall); // incoming call
        socket.on("callAccepted", handleCallAccepted); // call accepted
        socket.on("peer-negotiation-needed", handleNegotiationIncoming); // renegotiation start
        socket.on("peer-negotiation-final", handleNegotiationFinal); // renegotiation end
        socket.on("endCall", endConnection); // call ended by remote user

        // Cleanup listeners on unmount
        return () => {
            socket.off("userJoin", handleUserJoin);
            socket.off("incommingCall", handleincommingCall);
            socket.off("callAccepted", handleCallAccepted);
            socket.off("peer-negotiation-needed", handleNegotiationIncoming);
            socket.off("peer-negotiation-final", handleNegotiationFinal);
            socket.off("endCall", endConnection);
        }

    }, [socket, handleUserJoin, handleincommingCall, handleCallAccepted, handleNegotiationIncoming, handleNegotiationFinal, endConnection]);

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

                {/* Debug info */}
                {allRemoteStreams.length > 0 && (
                    <div className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                        Remote Streams: {allRemoteStreams.length} |
                        {allRemoteStreams.map((stream, index) => (
                            <span key={stream.id} className="ml-1">
                                [{index}]: {stream.getTracks().length} tracks
                            </span>
                        ))}
                    </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3 mt-2 justify-center">

                    {/* Call button */}
                    {remoteSocetId && (
                        <button
                            onClick={handleCallUser}
                            className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition"
                        >
                            📞 Call
                        </button>
                    )}

                    {/* Mute button */}
                    {myStream && (
                        <button
                            onClick={toggleMute}
                            className="w-full md:w-auto bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg font-medium transition"
                        >
                            {isMuted ? '🔇 Unmute' : '🔊 Mute'}
                        </button>
                    )}

                    {/* Share screen button */}
                    {myStream && (
                        <button
                            onClick={shareScreen}
                            className={`w-full md:w-auto px-4 py-2 rounded-lg font-medium transition ${
                                isScreenSharing
                                    ? 'bg-red-600 hover:bg-red-700'
                                    : 'bg-purple-600 hover:bg-purple-700'
                            }`}
                        >
                            {isScreenSharing ? '⏹️ Stop Sharing' : '📺 Share Screen'}
                        </button>
                    )}

                    {/* Switch camera button */}
                    {myStream && (
                        <button
                            onClick={switchCamera}
                            disabled={videoDevices.length <= 1}
                            className={`w-full md:w-auto px-4 py-2 rounded-lg font-medium transition ${
                                videoDevices.length <= 1
                                    ? 'bg-gray-600 cursor-not-allowed'
                                    : 'bg-indigo-600 hover:bg-indigo-700'
                            }`}
                        >
                            🔄 Switch Camera {videoDevices.length <= 1 ? '(1 cam)' : ''}
                        </button>
                    )}

                    {/* End connection button */}
                    <button
                        onClick={endConnection}
                        className="w-full md:w-auto bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-medium transition"
                    >
                        📞 End Call
                    </button>
                </div>

                {/* Video display section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-4">

                    {/* Local video */}
                    {myStream && (
                        <div className="bg-black rounded-xl overflow-hidden border border-gray-700 p-2 flex flex-col items-center">
                            <h2 className="text-sm mb-2 text-gray-300">My Video</h2>

                            <video
                                ref={localVideoRef}
                                autoPlay
                                muted // prevent echo
                                className="rounded-lg w-full h-48 object-cover"
                                style={{ transform: 'scaleX(-1)' }} // Mirror effect for self-view
                            />
                        </div>
                    )}

                    {/* Remote video */}
                    {remoteStream && (
                        <div className="bg-black rounded-xl overflow-hidden border border-gray-700 p-2 flex flex-col items-center">
                            <h2 className="text-sm mb-2 text-gray-300">Remote Video</h2>

                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                className="rounded-lg w-full h-48 object-cover"
                                style={{ transform: 'scaleX(-1)' }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}