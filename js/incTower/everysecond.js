define(['incTower/core', 'lib/bignumber'], function (incTower, BigNumber) {
    'use strict';
    incTower.everySecond = function() {
        //Check paused
        if (incTower.paused()) { return; }
        //Training skills
        var incrementObservable = incTower.incrementObservable;
        incTower.mana(BigNumber.min(incTower.maxMana(), incTower.mana().plus(incTower.manaRegeneration())));
        incTower.checkQueue();

        var skillName = incTower.activeSkill();
        var skill = incTower.skills.get(skillName)();
        if (skill !== null) {
            incrementObservable(skill.get('skillPoints'), incTower.skillRate());
            while (skill.get('skillPoints')().gte(skill.get('skillPointsCap')())) {
                skill.get('skillPoints')(skill.get('skillPoints')().sub(skill.get('skillPointsCap')()));
                incrementObservable(skill.get('skillLevel'));
                //console.log(incTower.activeSkill());
                skill.get('skillPointsCap')(incTower.costCalc(incTower.skillAttributes[incTower.activeSkill()].baseCost, skill.get('skillLevel')(), incTower.skillAttributes[incTower.activeSkill()].growth));
                incTower.checkHelp('skills');
                incTower.skillQueue.shift();
                incTower.checkSkill(skillName);
                incTower.checkQueue();
            }
        }
        incTower.enemys.forEachAlive(function(enemy) {
            if (enemy.regenerating > 0 && enemy.statusEffects.chilled().lt(100)) {
                var curHealth = enemy.health();
                var healAmount = enemy.maxHealth.times(enemy.regenerating * 0.01);
                if (healAmount.add(curHealth).gt(enemy.maxHealth)) { healAmount = enemy.maxHealth.minus(curHealth); }
                if (enemy.statusEffects.burning() > 0) {
                    enemy.statusEffects.burning(enemy.statusEffects.burning().times(0.8)); //Reduces the burning instead of allowing a full regen tick
                } else if (healAmount > 0) {
                    incTower.createFloatingText({'color':'green', 'around':enemy,'amount':healAmount, 'type':'regenerating'});
                    incrementObservable(enemy.health,healAmount);
                }
            }
            if (enemy.teleport > 0 && enemy.statusEffects.chilled().lt(100) && !enemy.knockback) {
                if (incTower.game.rnd.integerInRange(0,100) <= 10) {
                    var origScale = enemy.scale.x;
                    var curTileEntry = enemy.path[enemy.curTile];
                    var possibleTiles = [];
                    var maxTile = 0;
                    incTower.enemys.forEachAlive(function (otherEnemy) {
                        maxTile = Math.max(maxTile, otherEnemy.curTile);
                    });
                    //We are allowed to teleport up to 1 space after the furthest any enemy has gone
                    maxTile = Math.min(maxTile + 1, enemy.path.length);
                    for (var i = enemy.curTile;i < maxTile;++i) {
                        var destTile = enemy.path[i];
                        var dist = Math.abs(destTile.x - curTileEntry.x) + Math.abs(destTile.y - curTileEntry.y);
                        if (dist <= enemy.teleport && dist >= 1) {
                            possibleTiles.push(i);
                        }
                    }
                    if (possibleTiles.length > 0) {
                        enemy.teleporting = true;
                        var blinkTween = incTower.game.add.tween(enemy.scale).to({x:0},250, Phaser.Easing.Quadratic.In);
                        enemy.curTile = incTower.game.rnd.pick(possibleTiles);
                        var bestTile = enemy.path[enemy.curTile];
                        var moveTween = incTower.game.add.tween(enemy).to({x:bestTile.x * 32 + 16, y:bestTile.y * 32 + 16},50,"Linear");
                        var blinkInTween = incTower.game.add.tween(enemy.scale).to({x:origScale},250, Phaser.Easing.Quadratic.In);
                        blinkInTween.onComplete.add(function () {
                            enemy.teleporting = false;
                            enemy.nextTile();
                        });
                        blinkTween.chain(moveTween,blinkInTween);
                        blinkTween.start();
                    }
                }
            }
            _.mapValues(enemy.statusEffects, function (effect, effectName) {
                if (effect().gt(0)) {
                    var reduction = 0.8;
                    if (effectName === 'bleeding') {
                        reduction = 0.5 + (0.05 * incTower.getEffectiveSkillLevel('anticoagulants'));
                    }
                    effect(effect().times(reduction));
                    if (effectName === 'burning') {
                        enemy.assignDamage(effect(),'fire');
                    }
                    if (effectName === 'bleeding') {
                        enemy.assignDamage(effect(),'bleed');
                    }
                    if (effect().lt(3)) {
                        effect(new BigNumber(0));
                        if (effectName === 'burning') {
                            enemy.burningSprite.visible = false;
                        }
                    }
                }
            });
            enemy.elementalRuneDiminishing = _.mapValues(enemy.elementalRuneDiminishing, function (dim) {
                if (dim < 0.5) { return 0; }
                return dim * 0.95;
            });
            var reaction = false;
            _.forEach(enemy.elementalRunes, function (rune) {
                var chance = 0.1; //Base 10% chance for each rune to start a reaction
                chance *= Math.pow(0.97, enemy.elementalRuneDiminishing[rune.runeType] || 0); //Reduced chance based on diminishing returns
                if (incTower.game.rnd.frac() < chance) {
                    reaction = rune.runeType;
                    return false;
                }
            });
            if (reaction) {
                var newElementalRunes = [];
                var eligibleToReact = {};
                eligibleToReact[reaction] = true;
                var reactionCounts = {};
                _.forEach(enemy.elementalRunes, function (rune) {
                    var runeType = rune.runeType;
                    if (runeType in eligibleToReact) {
                        if (!(runeType in reactionCounts)) { reactionCounts[runeType] = 0; }
                        reactionCounts[runeType]++;
                        rune.destroy();
                    } else {
                        newElementalRunes.push(rune);
                    }
                });
                enemy.elementalRunes = newElementalRunes;
                enemy.repositionRunes();
                enemy.performReaction(reaction, reactionCounts);
                //Run the reaction
            }
        });
    };
});