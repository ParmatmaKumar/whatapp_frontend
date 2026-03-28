class PeerService {
    constructor() {
        this._onTrack = null;
        this._onIceCandidate = null;
        this.createPeerConnection();
    }

    createPeerConnection() {
        if (this.peer) {
            this.peer.close();
        }

        this.peer = new RTCPeerConnection({
            iceServers: [
                {
                    urls: [
                        "stun:stun.l.google.com:19302",
                        "stun:global.stun.twilio.com:3478",
                    ],
                },
            ],
        });

        this.peer.ontrack = (event) => {
            if (this._onTrack) {
                this._onTrack(event);
            }
        };

        this.peer.onicecandidate = (event) => {
            if (this._onIceCandidate && event.candidate) {
                this._onIceCandidate(event.candidate);
            }
        };
    }

    async createOffer() {
        if (this.peer) {
            const offer = await this.peer.createOffer();
            await this.peer.setLocalDescription(offer);
            return offer;
        }
    }

    async getAnswer(offer) {
        if (this.peer) {
            await this.peer.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.peer.createAnswer();
            await this.peer.setLocalDescription(answer);
            return answer;
        }
    }

    async setRemoteDescription(answer) {
        if (this.peer) {
            await this.peer.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }

    async addIceCandidate(candidate) {
        if (this.peer && candidate) {
            await this.peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }

    onTrack(callback) {
        this._onTrack = callback;
        if (this.peer) {
            this.peer.ontrack = (event) => {
                if (callback) {
                    callback(event);
                }
            };
        }
    }

    onIceCandidate(callback) {
        this._onIceCandidate = callback;
        if (this.peer) {
            this.peer.onicecandidate = (event) => {
                if (event.candidate && callback) {
                    callback(event.candidate);
                }
            };
        }
    }

    resetPeerConnection() {
        this.createPeerConnection();
    }
}

export default new PeerService();
