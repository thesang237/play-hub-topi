import React from "react";
import ReactDOM from "react-dom/client";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Check,
  Clipboard,
  Headphones,
  ListMusic,
  LogIn,
  MessageCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Send,
  Share2,
  SkipForward,
  Trash2,
  UsersRound,
  Volume1,
  Volume2,
  VolumeX,
  Youtube
} from "lucide-react";
import "./styles.css";

type Member = {
  id: string;
  nickname: string;
  online: boolean;
};

type VideoSearchResult = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
};

type QueueItem = VideoSearchResult & {
  id: string;
  addedBy: {
    id: string;
    nickname: string;
  };
  addedAt: number;
};

type ActivityItem = {
  id: string;
  message: string;
  createdAt: number;
  kind?: "activity" | "chat";
  actor?: {
    id: string;
    nickname: string;
  };
  text?: string;
  video?: VideoSearchResult;
};

type QueueTab = "queue" | "history";

type PlayerAudioPreference = {
  volume: number;
  muted: boolean;
};

type PlaybackState = {
  videoId: string;
  status: "playing" | "paused";
  positionSeconds: number;
  playbackRate: number;
  updatedAt: number;
  updatedBy: string;
};

type RoomState = {
  id: string;
  name: string;
  members: Member[];
  queue: QueueItem[];
  activity: ActivityItem[];
  playback: PlaybackState;
};

type PlayerApi = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlaybackRate: () => number;
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  setPlaybackRate: (suggestedRate: number) => void;
  getVolume: () => number;
  setVolume: (volume: number) => void;
  getVideoData?: () => {
    video_id?: string;
    videoId?: string;
  };
  isMuted: () => boolean;
  mute: () => void;
  unMute: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          videoId?: string;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (event: { target: PlayerApi }) => void;
            onStateChange?: (event: { data: number; target: PlayerApi }) => void;
          };
        }
      ) => PlayerApi;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const memberKey = "play-hub-member";
const playerAudioKey = "play-hub-player-audio";
const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

function App() {
  const initialRoomId = getRoomIdFromPath();
  const [roomId, setRoomId] = React.useState(initialRoomId);
  const [member, setMember] = React.useState<Member | null>(() => getStoredMember());
  const [nicknameInput, setNicknameInput] = React.useState("");
  const [roomState, setRoomState] = React.useState<RoomState | null>(null);
  const [socket, setSocket] = React.useState<WebSocket | null>(null);
  const [connection, setConnection] = React.useState<"idle" | "connecting" | "online" | "offline">("idle");
  const [connectionIssue, setConnectionIssue] = React.useState("");
  // Incremented when Safari restores this page from bfcache so the WebSocket
  // effect re-runs and gets a fresh connection.
  const [reconnectKey, setReconnectKey] = React.useState(0);

  React.useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      // event.persisted === true means Safari restored the page from bfcache
      // instead of doing a full load. React effects won't re-run on their own,
      // so we bump reconnectKey to force the WebSocket effect below to fire.
      if (event.persisted) {
        setReconnectKey((k) => k + 1);
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  React.useEffect(() => {
    if (!roomId || !member) return;

    setConnection("connecting");
    setConnectionIssue("");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const endpoint = `${protocol}://${window.location.host}/ws`;
    const ws = new WebSocket(endpoint);

    ws.addEventListener("open", () => {
      setConnection("online");
      setConnectionIssue("");
      ws.send(JSON.stringify({ type: "join", roomId, member }));
    });

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "room:state") {
        setRoomState(message.state);
      }
    });

    ws.addEventListener("error", () => {
      setConnectionIssue(`Could not connect to ${endpoint}`);
    });
    ws.addEventListener("close", () => setConnection("offline"));
    setSocket(ws);

    return () => ws.close();
    // reconnectKey is intentionally included so that a bfcache restore
    // (pageshow with persisted=true) creates a fresh WebSocket.
  }, [roomId, member?.id, reconnectKey]);

  const createRoom = () => {
    const nextRoomId = makeRoomId();
    window.history.pushState({}, "", `/room/${nextRoomId}`);
    setRoomId(nextRoomId);
  };

  const joinRoom = (event: React.FormEvent) => {
    event.preventDefault();
    if (!roomId) {
      createRoom();
      return;
    }
    const nickname = nicknameInput.trim().slice(0, 28);
    if (!nickname) return;

    const nextMember = {
      id: crypto.randomUUID(),
      nickname,
      online: true
    };
    window.localStorage.setItem(memberKey, JSON.stringify(nextMember));
    setMember(nextMember);
  };

  const renameMember = () => {
    if (!member) return;

    const nickname = window.prompt("Change nickname", member.nickname)?.trim().slice(0, 28);
    if (!nickname || nickname === member.nickname) return;

    const nextMember = { ...member, nickname, online: true };
    window.localStorage.setItem(memberKey, JSON.stringify(nextMember));
    setMember(nextMember);

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "member:rename", nickname }));
    }
  };

  if (!roomId) {
    return <CreateRoom onCreate={createRoom} />;
  }

  if (!member) {
    return (
      <JoinRoom
        roomId={roomId}
        nicknameInput={nicknameInput}
        onNicknameInput={setNicknameInput}
        onJoin={joinRoom}
      />
    );
  }

  return (
    <Room
      connection={connection}
      member={member}
      roomId={roomId}
      roomState={roomState}
      socket={socket}
      connectionIssue={connectionIssue}
      onRenameMember={renameMember}
    />
  );
}

function CreateRoom({ onCreate }: { onCreate: () => void }) {
  return (
    <main className="gate gateCreate">
      <div className="brandMark">
        <Headphones size={24} />
      </div>
      <section className="gatePanel">
        <p className="eyebrow">Shared listening rooms</p>
        <h1>Build the queue together.</h1>
        <p className="gateCopy">
          Create a no-login room, invite friends, search YouTube, and keep one shared playlist moving in sync.
        </p>
        <button className="primaryAction" onClick={onCreate}>
          <Plus size={18} />
          Create room
        </button>
      </section>
    </main>
  );
}

function JoinRoom({
  roomId,
  nicknameInput,
  onNicknameInput,
  onJoin
}: {
  roomId: string;
  nicknameInput: string;
  onNicknameInput: (value: string) => void;
  onJoin: (event: React.FormEvent) => void;
}) {
  return (
    <main className="gate">
      <section className="gatePanel joinPanel">
        <p className="eyebrow">Room {roomId}</p>
        <h1>Pick a nickname.</h1>
        <form className="joinForm" onSubmit={onJoin}>
          <input
            autoFocus
            maxLength={28}
            placeholder="Sang, Linh, Alex..."
            value={nicknameInput}
            onChange={(event) => onNicknameInput(event.target.value)}
          />
          <button className="primaryAction" type="submit">
            <LogIn size={18} />
            Join
          </button>
        </form>
      </section>
    </main>
  );
}

function RoomTitle({
  name,
  roomId,
  onRename
}: {
  name: string;
  roomId: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(name);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setDraft(name);
  }, [name]);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const submit = () => {
    const trimmed = draft.trim().slice(0, 60);
    setEditing(false);
    if (trimmed !== name) {
      onRename(trimmed);
    }
  };

  if (editing) {
    return (
      <form
        className="roomTitleForm"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          ref={inputRef}
          className="roomTitleInput"
          maxLength={60}
          placeholder={`Room ${roomId}`}
          value={draft}
          onBlur={submit}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="miniButton" type="submit" title="Save name">
          <Check size={15} />
        </button>
      </form>
    );
  }

  return (
    <h1 className="roomTitleDisplay" onClick={() => setEditing(true)} title="Click to rename">
      {name || `Room ${roomId}`}
      <Pencil size={14} className="roomTitlePencil" />
    </h1>
  );
}

function Room({
  connection,
  member,
  roomId,
  roomState,
  socket,
  connectionIssue,
  onRenameMember
}: {
  connection: "idle" | "connecting" | "online" | "offline";
  member: Member;
  roomId: string;
  roomState: RoomState | null;
  socket: WebSocket | null;
  connectionIssue: string;
  onRenameMember: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const playFromQueueRef = React.useRef<((videoId: string) => void) | null>(null);
  const queue = roomState?.queue ?? [];
  const playback = roomState?.playback;
  const nowPlaying = queue.find((item) => item.videoId === playback?.videoId) ?? queue[0];

  const send = React.useCallback(
    (message: Record<string, unknown>) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
    [socket]
  );
  const registerQueuePlay = React.useCallback((handler: ((videoId: string) => void) | null) => {
    playFromQueueRef.current = handler;
  }, []);
  const playQueueItem = React.useCallback(
    (item: QueueItem) => {
      if (playFromQueueRef.current) {
        playFromQueueRef.current(item.videoId);
        return;
      }

      send({
        type: "player:update",
        videoId: item.videoId,
        status: "playing",
        positionSeconds: 0,
        playbackRate: playback?.playbackRate ?? 1
      });
    },
    [playback?.playbackRate, send]
  );

  const inviteUrl = `${window.location.origin}/room/${roomId}`;
  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="roomIdentity">
          <div className="brandMark compact">
            <Headphones size={19} />
          </div>
          <div>
            <p className="eyebrow">Play Hub</p>
            <RoomTitle
              name={roomState?.name ?? ""}
              roomId={roomId}
              onRename={(name) => send({ type: "room:rename", name })}
            />
          </div>
        </div>
        <div className="topActions">
          <span className={`statusPill ${connection}`}>{connection}</span>
          <button className="ghostButton" onClick={copyInvite} title="Copy invite link">
            {copied ? <Clipboard size={17} /> : <Share2 size={17} />}
            {copied ? "Copied" : "Invite"}
          </button>
          <button className="ghostButton" onClick={onRenameMember} title="Change nickname">
            <UsersRound size={17} />
            {member.nickname}
          </button>
        </div>
      </header>
      {connectionIssue ? <div className="connectionBanner">{connectionIssue}</div> : null}

      <section className="stage">
        <PlayerCard
          playback={playback}
          nowPlaying={nowPlaying}
          onRegisterQueuePlay={registerQueuePlay}
          onSend={send}
        />
        <aside className="sideRail">
          <Members members={roomState?.members ?? [member]} />
          <ActivityLog activity={roomState?.activity ?? []} member={member} onSend={send} />
        </aside>
      </section>

      <section className="workspace">
        <div className="tabStrip">
          <button className="tabButton active">
            <Youtube size={18} />
            YouTube
          </button>
          <button className="tabButton disabled">Apps soon</button>
        </div>
        <div className="workspaceGrid">
          <YouTubeSearch onAdd={(item) => send({ type: "queue:add", item })} />
          <QueuePanel
            activity={roomState?.activity ?? []}
            queue={queue}
            playback={playback}
            onPlayItem={playQueueItem}
            onSend={send}
          />
        </div>
      </section>
    </main>
  );
}

function PlayerCard({
  playback,
  nowPlaying,
  onRegisterQueuePlay,
  onSend
}: {
  playback?: PlaybackState;
  nowPlaying?: QueueItem;
  onRegisterQueuePlay: (handler: ((videoId: string) => void) | null) => void;
  onSend: (message: Record<string, unknown>) => void;
}) {
  const playerRef = React.useRef<PlayerApi | null>(null);
  const playbackRef = React.useRef<PlaybackState | undefined>(playback);
  const desiredStatusRef = React.useRef<PlaybackState["status"]>(playback?.status ?? "paused");
  const lastAppliedRef = React.useRef("");
  const endedSignalRef = React.useRef("");
  const currentVideoRef = React.useRef("");
  // True once the user has clicked Play, Pause, or "Sync & Play".
  // Chrome and Safari require a user gesture before any programmatic playback.
  const hasInteractedRef = React.useRef(false);
  const [apiReady, setApiReady] = React.useState(() => Boolean(window.YT?.Player));
  const [playerReady, setPlayerReady] = React.useState(false);
  const [durationSeconds, setDurationSeconds] = React.useState(0);
  const [progressSeconds, setProgressSeconds] = React.useState(0);
  const [isSeeking, setIsSeeking] = React.useState(false);
  const [volume, setVolume] = React.useState(() => getStoredPlayerAudio().volume);
  const [muted, setMuted] = React.useState(() => getStoredPlayerAudio().muted);
  const localAudioRef = React.useRef<PlayerAudioPreference>({ volume, muted });
  // True when the room is playing but we can't autoplay without a user tap.
  const [needsUserGesture, setNeedsUserGesture] = React.useState(false);

  React.useEffect(() => {
    playbackRef.current = playback;
    desiredStatusRef.current = playback?.status ?? "paused";
  }, [playback]);

  React.useEffect(() => {
    const preference = { volume, muted };
    localAudioRef.current = preference;
    storePlayerAudio(preference);

    if (playerReady && playerRef.current) {
      applyPlayerAudioPreference(playerRef.current, preference);
    }
  }, [muted, playerReady, volume]);

  React.useEffect(() => {
    if (!playerReady) return;

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== "function") return;

      if (!isSeeking) {
        setProgressSeconds(player.getCurrentTime() || 0);
      }

      if (typeof player.getDuration === "function") {
        setDurationSeconds(player.getDuration() || 0);
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [isSeeking, playerReady]);

  React.useEffect(() => {
    if (window.YT?.Player) {
      setApiReady(true);
      return;
    }

    if (!document.querySelector("script[src='https://www.youtube.com/iframe_api']")) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    }

    window.onYouTubeIframeAPIReady = () => {
      setApiReady(true);
    };
  }, []);

  React.useEffect(() => {
    if (!apiReady || !window.YT || playerRef.current || !document.getElementById("youtube-player")) return;

    playerRef.current = new window.YT.Player("youtube-player", {
      playerVars: {
        controls: 0,
        disablekb: 1,
        enablejsapi: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        rel: 0
      },
      events: {
        onReady: (event) => {
          playerRef.current = event.target;
          applyPlayerAudioPreference(event.target, localAudioRef.current);
          setPlayerReady(true);
        },
        onStateChange: (event) => {
          const currentPlayback = playbackRef.current;
          if (!window.YT || !currentPlayback?.videoId) return;
          if (event.data === window.YT.PlayerState.ENDED) {
            const endedVideoId = getPlayerVideoId(event.target) || currentVideoRef.current;
            if (endedVideoId !== currentPlayback.videoId) return;

            const endedSignature = `${currentPlayback.videoId}:${currentPlayback.updatedAt}`;
            if (endedSignalRef.current === endedSignature) return;
            endedSignalRef.current = endedSignature;

            onSend({
              type: "queue:ended",
              videoId: currentPlayback.videoId,
              playbackUpdatedAt: currentPlayback.updatedAt
            });
            return;
          }

          const player = event.target;
          const desiredStatus = desiredStatusRef.current;

          if (event.data === window.YT.PlayerState.PLAYING && desiredStatus !== "playing") {
            window.setTimeout(() => player.pauseVideo(), 0);
          }

          // Only try to resume if the user has already interacted.
          // Without a prior gesture, playVideo() is silently blocked by the
          // browser autoplay policy and this would loop forever.
          if (event.data === window.YT.PlayerState.PAUSED && desiredStatus !== "paused" && hasInteractedRef.current) {
            window.setTimeout(() => player.playVideo(), 0);
          }
        }
      }
    });
  }, [apiReady, onSend]);

  React.useEffect(() => {
    const player = playerRef.current;
    if (!playerReady || !player || !playback?.videoId || !isYouTubeVideoId(playback.videoId)) return;
    if (
      typeof player.playVideo !== "function" ||
      typeof player.pauseVideo !== "function" ||
      typeof player.seekTo !== "function" ||
      typeof player.loadVideoById !== "function" ||
      typeof player.cueVideoById !== "function" ||
      typeof player.setPlaybackRate !== "function"
    ) {
      return;
    }

    const playbackRate = playback.playbackRate ?? 1;
    const signature = `${playback.videoId}:${playback.status}:${playback.positionSeconds}:${playbackRate}:${playback.updatedAt}`;
    if (lastAppliedRef.current === signature) return;
    lastAppliedRef.current = signature;

    const elapsed = playback.status === "playing" ? ((Date.now() - playback.updatedAt) / 1000) * playbackRate : 0;
    const targetSeconds = Math.max(0, playback.positionSeconds + elapsed);
    player.setPlaybackRate(playbackRate);
    applyPlayerAudioPreference(player, localAudioRef.current);
    setProgressSeconds(targetSeconds);

    if (currentVideoRef.current !== playback.videoId) {
      currentVideoRef.current = playback.videoId;
      if (playback.status === "playing" && hasInteractedRef.current) {
        // loadVideoById auto-plays — only safe after a user gesture.
        player.loadVideoById(playback.videoId, targetSeconds);
      } else {
        // cueVideoById loads without playing, works without a gesture.
        player.cueVideoById(playback.videoId, targetSeconds);
      }
    } else {
      const currentSeconds = position();
      if (Math.abs(currentSeconds - targetSeconds) > 1.25) {
        player.seekTo(targetSeconds, true);
      }
    }

    if (playback.status === "playing") {
      if (hasInteractedRef.current) {
        player.playVideo();
        setNeedsUserGesture(false);
      } else {
        // Show the Sync overlay so the user can tap to unblock autoplay.
        setNeedsUserGesture(true);
      }
    } else {
      player.seekTo(targetSeconds, true);
      player.pauseVideo();
      setNeedsUserGesture(false);
    }
  }, [playerReady, playback]);

  const position = () => {
    if (typeof playerRef.current?.getCurrentTime !== "function") return 0;
    return playerRef.current.getCurrentTime();
  };
  const playbackRate = playback?.playbackRate ?? 1;
  const videoId = playback?.videoId || nowPlaying?.videoId || "";
  const hasValidVideoId = isYouTubeVideoId(videoId);

  React.useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const ignoreMediaKey = () => undefined;
    const actions: MediaSessionAction[] = ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward"];

    for (const action of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, ignoreMediaKey);
      } catch {
        // Some browsers do not support every media session action.
      }
    }
  }, []);

  // Pause the YouTube player when the tab is closed or hidden.
  // Safari fires `pagehide` reliably on tab close; `visibilitychange` covers
  // tab-switch / background scenarios across all browsers.
  React.useEffect(() => {
    const handlePause = () => {
      try {
        playerRef.current?.pauseVideo();
      } catch {
        // Player may already be destroyed.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handlePause();
      }
    };

    window.addEventListener("pagehide", handlePause);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handlePause);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const play = () => {
    if (!hasValidVideoId) return;
    hasInteractedRef.current = true;
    setNeedsUserGesture(false);
    desiredStatusRef.current = "playing";
    if (playerReady && playerRef.current) {
      if (currentVideoRef.current !== videoId) {
        currentVideoRef.current = videoId;
        playerRef.current.loadVideoById(videoId, 0);
      }
      playerRef.current.setPlaybackRate(playbackRate);
      applyPlayerAudioPreference(playerRef.current, localAudioRef.current);
      playerRef.current.playVideo();
    }
    onSend({ type: "player:update", videoId, status: "playing", positionSeconds: position(), playbackRate });
  };
  const playVideoById = React.useCallback(
    (nextVideoId: string) => {
      if (!isYouTubeVideoId(nextVideoId)) return;
      hasInteractedRef.current = true;
      setNeedsUserGesture(false);
      desiredStatusRef.current = "playing";
      const seconds = 0;
      if (playerReady && playerRef.current) {
        currentVideoRef.current = nextVideoId;
        playerRef.current.setPlaybackRate(playbackRate);
        playerRef.current.loadVideoById(nextVideoId, seconds);
        applyPlayerAudioPreference(playerRef.current, localAudioRef.current);
        playerRef.current.playVideo();
      }
      onSend({
        type: "player:update",
        videoId: nextVideoId,
        status: "playing",
        positionSeconds: seconds,
        playbackRate
      });
    },
    [onSend, playbackRate, playerReady]
  );

  React.useEffect(() => {
    onRegisterQueuePlay(playVideoById);
    return () => onRegisterQueuePlay(null);
  }, [onRegisterQueuePlay, playVideoById]);

  const pause = () => {
    if (!hasValidVideoId) return;
    hasInteractedRef.current = true;
    desiredStatusRef.current = "paused";
    const seconds = position();
    if (playerReady && playerRef.current) {
      playerRef.current.pauseVideo();
    }
    onSend({ type: "player:update", videoId, status: "paused", positionSeconds: seconds, playbackRate });
  };
  // Called when the user taps the "Sync & Play" overlay. This constitutes a
  // user gesture, which satisfies browser autoplay policies on Chrome/Safari.
  const syncAndPlay = () => {
    if (!playerRef.current || !playbackRef.current) return;
    hasInteractedRef.current = true;
    setNeedsUserGesture(false);
    desiredStatusRef.current = "playing";
    const pb = playbackRef.current;
    const pbRate = pb.playbackRate ?? 1;
    const elapsed = pb.status === "playing" ? ((Date.now() - pb.updatedAt) / 1000) * pbRate : 0;
    const targetSeconds = Math.max(0, pb.positionSeconds + elapsed);
    const player = playerRef.current;
    player.setPlaybackRate(pbRate);
    applyPlayerAudioPreference(player, localAudioRef.current);
    if (currentVideoRef.current !== pb.videoId) {
      currentVideoRef.current = pb.videoId;
      player.loadVideoById(pb.videoId, targetSeconds);
    } else {
      player.seekTo(targetSeconds, true);
      player.playVideo();
    }
  };
  const seek = (seconds: number) => {
    if (!hasValidVideoId) return;
    const nextSeconds = Math.max(0, Math.min(seconds, durationSeconds || seconds));
    setProgressSeconds(nextSeconds);
    setIsSeeking(false);
    playerRef.current?.seekTo(nextSeconds, true);
    onSend({ type: "player:seek", positionSeconds: nextSeconds });
  };
  const changeSpeed = (rate: number) => {
    if (!hasValidVideoId) return;
    const seconds = position();
    playerRef.current?.setPlaybackRate(rate);
    onSend({ type: "player:rate", playbackRate: rate, positionSeconds: seconds });
  };
  const toggleMute = () => {
    if (!playerRef.current) return;
    if (muted) {
      playerRef.current.unMute();
      setMuted(false);
      if (volume === 0) {
        playerRef.current.setVolume(40);
        setVolume(40);
      }
    } else {
      playerRef.current.mute();
      setMuted(true);
    }
  };
  const changeVolume = (nextVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(100, Math.round(nextVolume)));
    setVolume(clampedVolume);
    if (!playerRef.current) return;
    const nextMuted = clampedVolume === 0;
    applyPlayerAudioPreference(playerRef.current, { volume: clampedVolume, muted: nextMuted });
    setMuted(nextMuted);
  };

  return (
    <section className="playerCard">
      <div className="videoFrame">
        <div id="youtube-player" className={hasValidVideoId ? "" : "playerHostEmpty"} />
        {hasValidVideoId ? <div className="playerClickShield" aria-hidden="true" /> : null}
        {!hasValidVideoId ? <EmptyPlayer /> : null}
        {needsUserGesture && hasValidVideoId ? (
          <div className="syncOverlay">
            <button className="syncButton" onClick={syncAndPlay}>
              <Play size={20} />
              Sync &amp; Play
            </button>
            <p>Audio is playing in this room</p>
          </div>
        ) : null}
      </div>
      <div className="playerMeta">
        <div>
          <p className="eyebrow">Now playing</p>
          <h2>{nowPlaying ? decodeHtml(nowPlaying.title) : "Queue a video to begin"}</h2>
          <p>{nowPlaying ? `Added by ${nowPlaying.addedBy.nickname}` : "Search YouTube below or paste a link."}</p>
        </div>
        <PlayerControls
          durationSeconds={durationSeconds}
          isSeeking={isSeeking}
          onChangeSpeed={changeSpeed}
          onChangeVolume={changeVolume}
          onPause={pause}
          onPlay={play}
          onProgressInput={(seconds) => {
            setIsSeeking(true);
            setProgressSeconds(seconds);
          }}
          onSeek={seek}
          onSkip={() => onSend({ type: "queue:next" })}
          onToggleMute={toggleMute}
          muted={muted}
          playback={playback}
          playbackRate={playbackRate}
          playerReady={playerReady}
          progressSeconds={progressSeconds}
          volume={volume}
          videoId={hasValidVideoId ? videoId : ""}
        />
      </div>
    </section>
  );
}

function EmptyPlayer() {
  return (
    <div className="emptyPlayer">
      <Youtube size={44} />
      <span>Waiting for the first track</span>
    </div>
  );
}

function PlayerControls({
  durationSeconds,
  onChangeSpeed,
  onChangeVolume,
  onPause,
  onPlay,
  onProgressInput,
  onSeek,
  onSkip,
  onToggleMute,
  muted,
  playback,
  playbackRate,
  playerReady,
  progressSeconds,
  volume,
  videoId
}: {
  durationSeconds: number;
  isSeeking: boolean;
  onChangeSpeed: (rate: number) => void;
  onChangeVolume: (volume: number) => void;
  onPause: () => void;
  onPlay: () => void;
  onProgressInput: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  onSkip: () => void;
  onToggleMute: () => void;
  muted: boolean;
  playback?: PlaybackState;
  playbackRate: number;
  playerReady: boolean;
  progressSeconds: number;
  volume: number;
  videoId: string;
}) {
  const disabled = !videoId || !playerReady;
  const max = Math.max(1, Math.floor(durationSeconds || 1));
  const clampedProgress = Math.max(0, Math.min(progressSeconds, max));
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <div className="playerControls">
      <div className="transportRow">
        <button
          className={`iconButton ${playback?.status === "playing" ? "active" : ""}`}
          disabled={disabled || playback?.status === "playing"}
          onClick={onPlay}
          title={playback?.status === "playing" ? "Playing" : playerReady ? "Play" : "Player loading"}
        >
          <Play size={18} />
        </button>
        <button
          className={`iconButton ${playback?.status === "paused" ? "active" : ""}`}
          disabled={disabled || playback?.status === "paused"}
          onClick={onPause}
          title={playback?.status === "paused" ? "Paused" : playerReady ? "Pause" : "Player loading"}
        >
          <Pause size={18} />
        </button>
        <button className="iconButton" disabled={!videoId} onClick={onSkip} title="Next">
          <SkipForward size={18} />
        </button>
        <button
          className={`iconButton ${muted ? "active" : ""}`}
          disabled={disabled}
          onClick={onToggleMute}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <div className="volumeControl">
          <button className="iconButton" disabled={disabled} title={`Volume ${volume}%`}>
            <VolumeIcon size={18} />
          </button>
          <div className="volumePopover" style={{ "--volume-level": `${volume}%` } as React.CSSProperties}>
            <input
              aria-label="Volume"
              className="volumeSlider"
              disabled={disabled}
              max={100}
              min={0}
              step={1}
              type="range"
              value={volume}
              onChange={(event) => onChangeVolume(Number(event.target.value))}
              onInput={(event) => onChangeVolume(Number(event.currentTarget.value))}
            />
            <span>{volume}%</span>
          </div>
        </div>
        <label className="speedControl">
          <span>Speed</span>
          <select
            disabled={disabled}
            value={playbackRate}
            onChange={(event) => onChangeSpeed(Number(event.target.value))}
            title="Playback speed"
          >
            {speedOptions.map((speed) => (
              <option key={speed} value={speed}>
                {speed}x
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="progressControl">
        <span>{formatDuration(clampedProgress)}</span>
        <input
          aria-label="Video progress"
          disabled={disabled}
          max={max}
          min={0}
          step={1}
          type="range"
          value={clampedProgress}
          onChange={(event) => onProgressInput(Number(event.target.value))}
          onMouseUp={(event) => onSeek(Number(event.currentTarget.value))}
          onTouchEnd={(event) => onSeek(Number(event.currentTarget.value))}
        />
        <span>{formatDuration(durationSeconds)}</span>
      </div>
    </div>
  );
}

function YouTubeSearch({ onAdd }: { onAdd: (item: VideoSearchResult) => void }) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<VideoSearchResult[]>([]);
  const [source, setSource] = React.useState("demo");
  const [loading, setLoading] = React.useState(false);

  const search = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    setResults(data.items);
    setSource(data.source);
    setLoading(false);
  };

  React.useEffect(() => {
    search();
  }, []);

  return (
    <section className="panel searchPanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Application</p>
          <h2>YouTube search</h2>
        </div>
        <span className="sourceBadge">{source}</span>
      </div>
      <form className="searchForm" onSubmit={search}>
        <Search size={18} />
        <input
          placeholder="Search videos or paste a YouTube link"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">{loading ? "..." : "Search"}</button>
      </form>
      <div className="resultList">
        {results.map((video) => (
          <article className="videoResult" key={video.videoId}>
            <img alt="" src={video.thumbnail} />
            <div>
              <h3>{decodeHtml(video.title)}</h3>
              <p>{decodeHtml(video.channelTitle)}</p>
            </div>
            <button className="iconButton add" onClick={() => onAdd(video)} title="Add to queue">
              <Plus size={18} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function QueuePanel({
  activity,
  queue,
  playback,
  onPlayItem,
  onSend
}: {
  activity: ActivityItem[];
  queue: QueueItem[];
  playback?: PlaybackState;
  onPlayItem: (item: QueueItem) => void;
  onSend: (message: Record<string, unknown>) => void;
}) {
  const [activeTab, setActiveTab] = React.useState<QueueTab>("queue");
  const history = activity.filter(isAddedVideoActivity).slice().reverse();

  return (
    <section className="panel queuePanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Shared playlist</p>
          <div className="queueTabs">
            <button className={`tabButton ${activeTab === "queue" ? "active" : ""}`} onClick={() => setActiveTab("queue")}>
              Queue
            </button>
            <button className={`tabButton ${activeTab === "history" ? "active" : ""}`} onClick={() => setActiveTab("history")}>
              History
            </button>
          </div>
        </div>
        <ListMusic size={22} />
      </div>
      {activeTab === "queue" ? (
        <div className="queueList">
          {queue.length === 0 ? (
            <p className="emptyText">No videos yet.</p>
          ) : (
            queue.map((item, index) => (
              <article className={`queueItem ${playback?.videoId === item.videoId ? "playing" : ""}`} key={item.id}>
                <span className="queueIndex">{index + 1}</span>
                <button className="queueThumb" onClick={() => onPlayItem(item)} title="Play this video">
                  <img alt="" src={item.thumbnail} />
                  <Play size={16} />
                </button>
                <div className="queueText">
                  <h3>{decodeHtml(item.title)}</h3>
                  <p>Added by {item.addedBy.nickname}</p>
                </div>
                <div className="queueActions">
                  <button
                    className="miniButton"
                    disabled={index === 0}
                    onClick={() => onSend({ type: "queue:reorder", itemId: item.id, toIndex: index - 1 })}
                    title="Move up"
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    className="miniButton"
                    disabled={index === queue.length - 1}
                    onClick={() => onSend({ type: "queue:reorder", itemId: item.id, toIndex: index + 1 })}
                    title="Move down"
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button className="miniButton danger" onClick={() => onSend({ type: "queue:remove", itemId: item.id })} title="Remove">
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      ) : (
        <div className="historyList">
          {history.length === 0 ? (
            <p className="emptyText">No queue history yet.</p>
          ) : (
            history.map((item) => (
              <AddedHistoryItem item={item} key={item.id} queue={queue} onAdd={(video) => onSend({ type: "queue:add", item: video })} />
            ))
          )}
        </div>
      )}
    </section>
  );
}

function Members({ members }: { members: Member[] }) {
  return (
    <section className="railPanel">
      <div className="railTitle">
        <UsersRound size={18} />
        Members
      </div>
      <div className="memberList">
        {members.map((member) => (
          <span className={member.online ? "member online" : "member"} key={member.id}>
            {member.nickname}
          </span>
        ))}
      </div>
    </section>
  );
}

function ActivityLog({
  activity,
  member,
  onSend
}: {
  activity: ActivityItem[];
  member: Member;
  onSend: (message: Record<string, unknown>) => void;
}) {
  const [message, setMessage] = React.useState("");
  const activityListRef = React.useRef<HTMLDivElement | null>(null);
  const visibleActivity = React.useMemo(
    () => activity.filter((item) => !isLeaveActivity(item)).slice().reverse(),
    [activity]
  );

  React.useEffect(() => {
    const list = activityListRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [visibleActivity.length]);

  const sendChat = (event: React.FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    onSend({ type: "chat:send", text });
    setMessage("");
  };

  return (
    <section className="railPanel activityPanel">
      <div className="railTitle">
        <Activity size={18} />
        Activity
      </div>
      <div className="activityList" ref={activityListRef}>
        {visibleActivity.length === 0 ? (
          <p className="emptyText">Room actions will appear here.</p>
        ) : (
          visibleActivity.map((item) => <ActivityLine item={item} key={item.id} />)
        )}
      </div>
      <form className="chatForm" onSubmit={sendChat}>
        <MessageCircle size={17} />
        <input
          aria-label="Chat message"
          maxLength={500}
          placeholder={`Message as ${member.nickname}`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button className="miniButton" disabled={!message.trim()} title="Send message" type="submit">
          <Send size={15} />
        </button>
      </form>
    </section>
  );
}

function AddedHistoryItem({
  item,
  queue,
  onAdd
}: {
  item: ActivityItem;
  queue: QueueItem[];
  onAdd: (video: VideoSearchResult) => void;
}) {
  const actor = item.actor?.nickname || getActivityActor(item.message);
  const video = getHistoryVideo(item, queue);
  const title = video?.title || getAddedVideoTitle(item.message);

  return (
    <article className="historyItem">
      {video?.thumbnail ? <img alt="" src={video.thumbnail} /> : <div className="historyThumbFallback"><Youtube size={18} /></div>}
      <div className="historyText">
        <h3>{decodeHtml(title || "Added video")}</h3>
        <p>
          <span>{formatTime(item.createdAt)}</span>
          {actor ? `Added by ${actor}` : "Added to queue"}
        </p>
        {video?.channelTitle ? <p>{decodeHtml(video.channelTitle)}</p> : null}
      </div>
      <button className="miniButton historyAddButton" disabled={!video} onClick={() => video && onAdd(video)} title="Add to queue">
        <Plus size={15} />
      </button>
    </article>
  );
}

function ActivityLine({ item }: { item: ActivityItem }) {
  const actor = item.actor?.nickname || getActivityActor(item.message);
  const detail = item.kind === "chat" ? item.text || item.message : getActivityDetail(item.message, actor);

  return (
    <p className={`activityLine ${item.kind === "chat" ? "chatMessage" : ""}`}>
      <span className="activityTime">{formatTime(item.createdAt)}</span>
      {actor ? <strong className="activityActor">{actor}</strong> : null}
      <span className="activityText">{detail}</span>
    </p>
  );
}

function getRoomIdFromPath() {
  const match = window.location.pathname.match(/^\/room\/([^/]+)/);
  return match?.[1] ?? "";
}

function getStoredMember() {
  try {
    const raw = window.localStorage.getItem(memberKey);
    return raw ? (JSON.parse(raw) as Member) : null;
  } catch {
    return null;
  }
}

function getStoredPlayerAudio(): PlayerAudioPreference {
  try {
    const raw = window.localStorage.getItem(playerAudioKey);
    if (!raw) return { volume: 80, muted: false };

    const preference = JSON.parse(raw) as Partial<PlayerAudioPreference>;
    return {
      volume: clampVolume(preference.volume),
      muted: Boolean(preference.muted)
    };
  } catch {
    return { volume: 80, muted: false };
  }
}

function storePlayerAudio(preference: PlayerAudioPreference) {
  try {
    window.localStorage.setItem(
      playerAudioKey,
      JSON.stringify({
        volume: clampVolume(preference.volume),
        muted: preference.muted
      })
    );
  } catch {
    // Local storage can be disabled in private browsing or strict site settings.
  }
}

function applyPlayerAudioPreference(player: PlayerApi, preference: PlayerAudioPreference) {
  const volume = clampVolume(preference.volume);

  if (typeof player.setVolume === "function") {
    player.setVolume(volume);
  }

  if (preference.muted || volume === 0) {
    player.mute();
  } else {
    player.unMute();
  }
}

function clampVolume(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 80;
  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp);
}

function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0:00";
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function isLeaveActivity(item: ActivityItem) {
  return item.kind !== "chat" && /\bleft the room\b/i.test(item.message);
}

function isAddedVideoActivity(item: ActivityItem) {
  return item.kind !== "chat" && /\badded\s+"/i.test(item.message);
}

function getAddedVideoTitle(message: string) {
  return message.match(/\badded\s+"(.+)"$/i)?.[1] ?? "";
}

function getHistoryVideo(item: ActivityItem, queue: QueueItem[]): VideoSearchResult | undefined {
  if (item.video) return item.video;
  const title = getAddedVideoTitle(item.message);
  if (!title) return undefined;
  return queue.find((video) => decodeHtml(video.title) === decodeHtml(title));
}

function getActivityActor(message: string) {
  const match = message.match(/^(.+?)\s(joined|rejoined|added|removed|moved|skipped|started|paused|jumped|changed)\b/i);
  return match?.[1] ?? "";
}

function getActivityDetail(message: string, actor: string) {
  if (!actor) return message;
  return message.slice(actor.length).trim();
}

function isYouTubeVideoId(value: string) {
  return /^[a-zA-Z0-9_-]{11}$/.test(value);
}

function getPlayerVideoId(player: PlayerApi) {
  try {
    const videoData = player.getVideoData?.();
    return videoData?.video_id || videoData?.videoId || "";
  } catch {
    return "";
  }
}

function decodeHtml(value: string) {
  const parser = document.createElement("textarea");
  parser.innerHTML = value;
  return parser.value;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />
);
