import * as UI from "../../ui.js";
import { MUSIC_MENU_ORDER, MUSIC_NAMES, MusicPlayer } from "./music.js";

const MUSIC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="white" aria-hidden="true"><path d="M9 4v11.2a4.5 3.5 0 1 0 2 2.8V8l8-2v7.2a4.5 3.5 0 1 0 2 2.8V1L9 4z"/></svg>`;

export function createMusicPanel(music: MusicPlayer): UI.Panel {
    const panel = new UI.Panel();
    panel.customHeaderBackgroundColor = "rgb(89, 65, 145)";
    panel.setTitle(MUSIC_ICON, "Music");
    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;gap:8px;padding:8px";
    const play = document.createElement("button");
    play.onclick = () => music.play();
    const pause = document.createElement("button");
    pause.textContent = "Pause";
    pause.onclick = () => music.pause();
    const startup = document.createElement("button");
    startup.textContent = music.startup.source === "unresolved" ? "Game Default" : "Level Start";
    startup.onclick = () => music.selectTrack(music.startup.trackId);
    controls.append(play, pause, startup);
    panel.contents.appendChild(controls);
    const volume = new UI.Slider();
    volume.setLabel("Volume");
    volume.setRange(0, 1, 0.01);
    volume.setValue(music.volume);
    volume.onvalue = value => music.setVolume(value);
    panel.contents.appendChild(volume.elem);
    const status = document.createElement("div");
    status.style.cssText = "padding:4px 8px;font-size:85%";
    status.setAttribute("role", "status");
    panel.contents.appendChild(status);
    const list = new UI.SingleSelect();
    const startupLabel = music.startup.source === "unresolved" ? "Game default" : "Level start";
    list.setStrings(MUSIC_MENU_ORDER.map(id => id === music.startup.trackId ? `${MUSIC_NAMES[id]} · ${startupLabel}` : MUSIC_NAMES[id]));
    list.setHeight("260px");
    list.onselectionchange = index => music.selectTrack(MUSIC_MENU_ORDER[index]);
    panel.contents.appendChild(list.elem);
    const note = document.createElement("div");
    note.style.cssText = "padding:8px;font-size:80%;color:#aaa";
    note.textContent = "Original instruments; approximate envelopes and mix. Music plays independently of scene time.";
    if (music.startup.source === "unresolved") note.textContent += " Startup script unresolved; using the game's initial track.";
    panel.contents.appendChild(note);
    music.onchanged = () => {
        list.setHighlighted(MUSIC_MENU_ORDER.indexOf(music.trackId));
        status.textContent = music.status;
        play.textContent = music.status === "Finished" ? "Replay" : "Play";
        pause.disabled = !music.enabled || music.trackId === 0;
    };
    music.onchanged();
    return panel;
}
