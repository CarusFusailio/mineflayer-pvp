import { Bot } from "mineflayer";
import { PVP } from "./PVP";

export function pvp(bot: Bot)
{
    const pvp = new PVP(bot);

    // @ts-expect-error
    bot.pvp = pvp;
}

export * from './Cooldown';
export * from './TimingSolver';
