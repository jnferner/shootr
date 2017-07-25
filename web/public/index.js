'use strict'

let io = null
let connectionInfo
let pingInfo
let states = []


function setPingInfo(ping) {
    pingInfo.text = 'Ping: ' + ping
    let fill
    if (ping < 100)
        fill = 0x57fc20
    else if (ping < 200)
        fill = 0xfc9520
    else
        fill = 0xef1c2a
    pingInfo.style.fill = fill
}

let ownId
function connect(address) {
    io = new WebSocket(address)
    io.onopen = () => {
        resetWait()
        connectionInfo.visible = false
    };

    io.onmessage = (serializedMsg) => {
        const msg = JSON.parse(serializedMsg.data, (key, value) => value === "" ? 0 : value)

        switch (msg.opcode) {
            case 'Greeting':
                ownId = msg.payload[0]
                const actors = msg.payload[1]

                for (let actor of actors) {
                    spawnActor(actor)
                }
                break;
            case 'Connect':
                const player = {id: msg.payload.id, kind: "Player"}
                spawnActor(player)
                break;
            case 'Disconnect':
                removeActor(msg.payload)
                break;
            case 'WorldUpdate':
                const state = {}
                state.actors = msg.payload
                state.timestamp = msg.timestamp
                states.push(state)
                // Todo: Exchange for real queue library
                setTimeout(states.shift, 100)
                break;
            default:
                throw 'Received invalid opcode: ' + msg.opcode
        }
    }

    io.onclose = () => {
        connectionInfo.text = 'Attempting to reconnect'
        connectionInfo.visible = true
        io = null
        setTimeout(() => {
            incrementWait()
            connect(address);
        }, wait)
    };

    io.onerror = () => {
        connectionInfo.text = 'Lost connection to server'
        connectionInfo.visible = true
        for (let id of Object.keys(actors))
            removeActor(id)
        io.close()
        io = null
    };
}

const MIN_WAIT = 100
let wait = MIN_WAIT

function resetWait() {
    wait = MIN_WAIT
}

function incrementWait() {
    const MAX_WAIT = 2000
    if (wait < MAX_WAIT)
        wait *= 1.25
    else
        wait = MAX_WAIT
}

function send(data) {
    if (io && io.readyState === 1) {
        console.log('sending data: ', data)
        io.send(JSON.stringify(data))
    }
}

const Application = PIXI.Application,
    loader = PIXI.loader,
    resources = PIXI.loader.resources,
    Sprite = PIXI.Sprite

const GAME_WIDTH = 1000
const GAME_HEIGHT = 1000
const app = new Application(
    screen.availWidth, screen.availHeight, {
        backgroundColor: 0xFFFFFF,
        antialias: true,
    },
)

document.body.appendChild(app.view)

loader
    .add([{
        name: 'pong',
        url: 'assets/pong.json'
    }, ])
    .on('progress', loadProgressHandler)
    .load(setup)

let validKeys = ["ArrowUp", "ArrowDown"]
let keyPressed = {
    ArrowLeft: false,
    ArrowRight: false
}
document.addEventListener("keydown", (event) => {
    sendKeyWithVal(event.key, true)
})
document.addEventListener("keyup", (event) => {
    sendKeyWithVal(event.key, false)
})

function sendKeyWithVal(key, val) {
    if (validKeys.indexOf(key) > -1) {
        sendIfNew(key, val)
    }
}

let msgId = 0

function sendIfNew(key, val) {
    if (keyPressed[key] !== val) {
        keyPressed[key] = val
        let msg = {
            id: msgId,
            key: key,
            pressed: val
        }
        msgId++
        send(msg)
    }
}

function loadProgressHandler(loader, resource) {
    console.log('loading: ' + resource.name + ' (' + resource.url + ')')
    console.log('progress: ' + loader.progress + '%')
    if (resource.error)
        console.error(resource.error)
}

function setup() {
    const background = new Sprite(resources.pong.textures['fancy-court.png'])
    background.width = GAME_WIDTH
    background.height = GAME_HEIGHT
    app.stage.addChild(background)

    connectionInfo = new PIXI.Text('')
    connectionInfo.style.fill = 0xe3e3ed
    connectionInfo.style.dropShadow = true
    connectionInfo.style.dropShadowAlpha = 0.7
    connectionInfo.y = 30
    connectionInfo.x = GAME_WIDTH - 300
    app.stage.addChild(connectionInfo)

    pingInfo = new PIXI.Text('Ping: Calculating...')
    pingInfo.style.fill = 0xe3e3ed
    pingInfo.style.dropShadow = true
    pingInfo.style.dropShadowAlpha = 0.7
    pingInfo.y = 30
    pingInfo.x = 40
    app.stage.addChild(pingInfo)

    resize()
    window.addEventListener('resize', resize);

    setInterval(() => setPingInfo(getOwnPing()), 1000)
    const addr = window.location.hostname === 'localhost' ? 'ws://localhost:8081' : 'wss://beta.jnferner.com/socket'
    connect(addr)
    app.ticker.add(gameLoop)
}

function getOwnPing() {
    if (states.length === 0 || !ownId)
        return 0
    const players = states[states.length - 1].actors
    return players[ownId].delay
}

function resize() {
    let ratio = window.innerWidth / GAME_WIDTH
    if (GAME_HEIGHT * ratio > window.innerHeight)
        ratio = window.innerHeight / GAME_HEIGHT
    app.width = app.stage.width = GAME_WIDTH * ratio
    app.height = app.stage.height = GAME_HEIGHT * ratio
}


let state = connecting

function gameLoop(delta) {
    state()
}

function connecting() {
    const txt = 'Connecting...'
    if (connectionInfo.text != txt) {
        connectionInfo.text = txt
        connectionInfo.visible = true
    }

    const renderTime = getRenderTime(getOwnPing())
    const index = getIndexOfRenderState(states, renderTime)
    if (index >= 0) {
        connectionInfo.visible = false
        state = play
    }
}

function play() {
    render(states)
}


function render(states) {
    const renderTime = getRenderTime(getOwnPing())
    const index = getIndexOfRenderState(states, renderTime)
    if (index < 0)
        return
    let interpolatedState = getInterpolatedState(states[index], states[index + 1], renderTime)
    setWorld(interpolatedState)
}

function getRenderTime(ping) {
    const now = new Date().getTime()
    const minDelay = 100
    const maxDelay = 300
    const delay = Math.max(minDelay, Math.min(maxDelay, ping))
    return now - delay
}

function getIndexOfRenderState(states, renderTime) {
    const found = states.findIndex((state) => state.timestamp >= renderTime)
    return found - 1
}

function getInterpolatedState(from, to, renderTime) {
    const total = to.timestamp - from.timestamp
    const progress = renderTime - from.timestamp
    if (total === 0 || progress === 0)
        return from
    const fraction = progress / total
    let state = JSON.parse(JSON.stringify(from)).actors
    for (let id of Object.keys(state)) {
        const actor = state[id]
        const toActor = to[id]
        if (!toActor)
            continue
        const fromActor = from[id]

        actor.pos.x += (toActor.pos.x - fromActor.pos.x) * fraction
        actor.pos.y += (toActor.pos.y - fromActor.pos.y) * fraction
        actor.vel.x += (toActor.vel.x - fromActor.vel.x) * fraction
        actor.vel.y += (toActor.vel.y - fromActor.vel.y) * fraction
    }
    state.timestamp = renderTime
    return state
}


let actors = {}
function setWorld(state) {
    for (let id of Object.keys(state)) {
        const liveActor = actors[id]
        const stateActor = state[id]
        if (!liveActor || !stateActor)
            continue
        liveActor.x = stateActor.pos.x
        liveActor.y = stateActor.pos.y
        if (stateActor.vel)
            addBlur(liveActor, stateActor.vel)
    }
}

function addBlur(obj, vel) {
    const maxVel = Math.max(vel.x, vel.y)
    const strength = Math.pow(Math.atan(Math.pow((maxVel / 10), 1.5)), 2) - 0.2
    if (strength > 0.5) {
        const blurFilter = new PIXI.filters.BlurFilter(strength, 1, 1)
        obj.filters = [blurFilter]
    }
}


function spawnActor(actor) {
    let texture
    switch (actor.kind) {
        case "Player":
            texture = 'fancy-paddle-green.png'
            break;
        case "Ball":
            texture = 'fancy-ball.png'
            break;
        default:
            throw 'Tried to spawn invalid kind of actor: ' + actor.kind
    }
    const sprite = new Sprite(resources.pong.textures[texture])
    sprite.anchor.set(0.5)
    app.stage.addChild(sprite)
    actors[actor.id] = sprite
}

function removeActor(id) {
    const actor = actors[id]
    app.stage.removeChild(actor)
    delete actors[id]
}