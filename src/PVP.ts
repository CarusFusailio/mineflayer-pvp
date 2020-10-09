import { Bot } from "mineflayer";
import { Movements, Pathfinder, goals } from "mineflayer-pathfinder";
import { Entity } from "prismarine-entity";
import { MaxDamageOffset, TimingSolver } from "./TimingSolver";
import { TaskQueue } from 'mineflayer-utils';

/**
 * The main pvp manager plugin class.
 */
export class PVP
{
    private readonly bot: Bot;
    private target?: Entity;
    private timeToNextAttack: number = 0;
    private wasInRange: boolean = false;

    /**
     * The movements object to pass to pathfinder when creating the follow entity goal. Assign
     * to null in order to avoid passing any movement config to pathfinder. (If you plan on using
     * your own)
     */
    movements?: Movements;

    /**
     * How close the bot will attempt to get to the target when when pursuing it.
     */
    followRange: number = 2;

    /**
     * How far away the target entity must be to lose the target. Target entities further than this
     * distance from the bot will be considered defeated.
     */
    viewDistance: number = 128;

    /**
     * How close must the bot be to the target in order to try attacking it.
     */
    attackRange: number = 3.5;

    /**
     * The timing solver to use when deciding how long to wait before preforming another attack
     * after finishing an attack.
     * 
     * // TODO Check for 'hasAtttackCooldown' feature. If feature not present, default to RandomTicks solver.
     */
    meleeAttackRate: TimingSolver = new MaxDamageOffset();

    /**
     * Creates a new instance of the PVP plugin.
     * 
     * @param bot - The bot this plugin is being attached to.
     */
    constructor(bot: Bot)
    {
        this.bot = bot;
        this.movements = new Movements(bot, require('minecraft-data')(bot.version));

        this.bot.on('physicTick', () => this.update());
    }

    /**
     * Causes the bot to begin attacking an entity until it is killed or told to stop.
     * 
     * @param target - The target to attack.
     */
    attack(target: Entity): void
    {
        this.stop();
        this.target = target;
        this.timeToNextAttack = 0;

        if (!this.target) return;

        // @ts-expect-error
        const pathfinder: Pathfinder = this.bot.pathfinder;
        if (this.movements) pathfinder.setMovements(this.movements);

        // @ts-expect-error The 'true' argument wasn't added to the typing until after 1.0.10 release.
        pathfinder.setGoal(new goals.GoalFollow(this.target, this.followRange), true);
    }

    /**
     * Stops attacking the current entity.
     */
    stop(): void
    {
        this.target = undefined;

        // @ts-expect-error
        const pathfinder: Pathfinder = this.bot.pathfinder;
        pathfinder.setGoal(null);
    }

    /**
     * Called each tick to update attack timers.
     */
    private update(): void
    {
        if (!this.target) return;

        this.checkRange();

        this.timeToNextAttack--;
        if (this.timeToNextAttack === -1)
            this.attemptAttack();
    }

    /**
     * Updates whether the bot is in attack range of the target or not.
     */
    private checkRange(): void
    {
        if (!this.target) return;

        const inRange = this.target.position.distanceTo(this.bot.entity.position) <= this.attackRange;

        if (!this.wasInRange && inRange)
            this.timeToNextAttack = 0;

        this.wasInRange = inRange;
    }

    /**
     * Attempts to preform an attack on the target.
     */
    private attemptAttack()
    {
        if (!this.target) return;

        if (!this.wasInRange)
        {
            this.timeToNextAttack = this.meleeAttackRate.getTicks(this.bot);
            return;
        }

        const queue = new TaskQueue()
        const target = this.target;
        const shield = this.hasShield();

        if (shield)
        {
            queue.addSync(() => this.bot.deactivateItem())
            queue.add(cb => setTimeout(cb, 100))
        }
            
        queue.add(cb => {
            if (target !== this.target) throw 'Target changed!';
            this.bot.lookAt(this.target.position.offset(0, this.target.height, 0), true, cb)
        });

        queue.addSync(() => {
            if (target !== this.target) throw 'Target changed!';
            this.bot.attack(this.target);
        });

        if (shield)
        {
            queue.add(cb => setTimeout(cb, 150))
            queue.addSync(() => {
                if (this.hasShield())
                    // @ts-expect-error TODO Mineflayer is missing the parameter in d.ts in version 2.30.0
                    this.bot.activateItem(true)
            })
        }

        queue.runAll((err) => {
            if (!err)
                this.timeToNextAttack = this.meleeAttackRate.getTicks(this.bot);
        });
    }

    /**
     * Check if the bot currently has a shield equipped.
     */
    private hasShield(): boolean
    {
        if (this.bot.supportFeature('doesntHaveOffHandSlot')) return false;

        const slot = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('off-hand')];
        if (!slot) return false;
    
        return slot.name.includes('shield');
    }
}
