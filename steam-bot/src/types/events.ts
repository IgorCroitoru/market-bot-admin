export type BotEvents = {
    ready:[ready:boolean]
    paused:[paused:boolean, cause: string | null, pauseEnd: number]
}