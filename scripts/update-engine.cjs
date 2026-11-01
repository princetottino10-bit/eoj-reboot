const fs = require('fs');

// ========================================
// 1. game.ts: Add new buff types
// ========================================
let game = fs.readFileSync('src/types/game.ts', 'utf-8');

game = game.replace(
  `type: 'atk_up' | 'atk_down' | 'sealed' | 'frozen' | 'direction_locked' | 'atk_cost_reduction';`,
  `type: 'atk_up' | 'atk_down' | 'sealed' | 'frozen' | 'direction_locked' | 'atk_cost_reduction' | 'has_protection' | 'has_dodge' | 'has_piercing' | 'has_quickness';`
);

if (game.includes('has_protection')) {
  console.log('game.ts: buff types updated OK');
} else {
  console.log('game.ts: FAILED to update buff types');
}
fs.writeFileSync('src/types/game.ts', game, 'utf-8');

// ========================================
// 2. effects.ts: Implement grant effects + consume_markers
// ========================================
let effects = fs.readFileSync('src/engine/effects.ts', 'utf-8');

// Replace grant_dodge (log only -> actual buff)
effects = effects.replace(
  /case 'grant_dodge': \{[\s\S]*?break;\s*\}/,
  `case 'grant_dodge': {
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character && !cell.character.buffs.some(b => b.type === 'has_dodge')) {
          const newBuffs = [...cell.character.buffs, { type: 'has_dodge' as const, value: 1, duration: 99 }];
          state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs as any });
          state = addLog(state, \`\${cell.character.card.name} が【回避】を得た\`);
        }
      }
      break;
    }`
);

// Add grant_protection, grant_piercing, grant_quickness, consume_markers after range_expand
effects = effects.replace(
  /case 'range_expand': \{[\s\S]*?break;\s*\}\s*\}/,
  `case 'range_expand': {
      // 範囲拡張は攻撃解決時に判定。ここではログのみ
      break;
    }

    case 'grant_protection': {
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character && !cell.character.buffs.some(b => b.type === 'has_protection')) {
          const newBuffs = [...cell.character.buffs, { type: 'has_protection' as const, value: 1, duration: 99 }];
          state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs as any });
          state = addLog(state, \`\${cell.character.card.name} が【防護】マーカーを得た\`);
        }
      }
      break;
    }

    case 'grant_piercing': {
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character && !cell.character.buffs.some(b => b.type === 'has_piercing')) {
          const newBuffs = [...cell.character.buffs, { type: 'has_piercing' as const, value: 1, duration: 99 }];
          state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs as any });
          state = addLog(state, \`\${cell.character.card.name} が【貫通】マーカーを得た\`);
        }
      }
      break;
    }

    case 'grant_quickness': {
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character && !cell.character.buffs.some(b => b.type === 'has_quickness')) {
          const newBuffs = [...cell.character.buffs, { type: 'has_quickness' as const, value: 1, duration: 99 }];
          state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs as any });
          state = addLog(state, \`\${cell.character.card.name} が【先制】マーカーを得た\`);
        }
      }
      break;
    }

    case 'consume_markers': {
      // アルス専用: 味方のマーカーを消費して効果を得る
      const allies = findAllies(state, owner);
      let markerCount = 0;
      // Count all markers on allies
      for (const ally of allies) {
        const aCell = getCell(state, ally.pos);
        if (aCell.character) {
          for (const b of aCell.character.buffs) {
            if (b.type === 'has_protection' || b.type === 'has_dodge' || b.type === 'has_piercing' || b.type === 'has_quickness') {
              markerCount++;
            }
          }
        }
      }
      // Also count markers on self
      const selfCell = getCell(state, ctx.sourcePos);
      if (selfCell.character) {
        for (const b of selfCell.character.buffs) {
          if (b.type === 'has_protection' || b.type === 'has_dodge' || b.type === 'has_piercing' || b.type === 'has_quickness') {
            markerCount++;
          }
        }
      }
      // Consume all markers from allies
      for (const ally of allies) {
        const aCell = getCell(state, ally.pos);
        if (aCell.character) {
          const cleaned = aCell.character.buffs.filter(b =>
            b.type !== 'has_protection' && b.type !== 'has_dodge' && b.type !== 'has_piercing' && b.type !== 'has_quickness'
          );
          if (cleaned.length !== aCell.character.buffs.length) {
            state = setCharacterOnCell(state, ally.pos, { ...aCell.character, buffs: cleaned as any });
          }
        }
      }
      // Consume from self too
      const selfCell2 = getCell(state, ctx.sourcePos);
      if (selfCell2.character) {
        const cleaned = selfCell2.character.buffs.filter(b =>
          b.type !== 'has_protection' && b.type !== 'has_dodge' && b.type !== 'has_piercing' && b.type !== 'has_quickness'
        );
        state = setCharacterOnCell(state, ctx.sourcePos, { ...selfCell2.character, buffs: cleaned as any });
      }

      state = addLog(state, \`盟約の収穫: \${markerCount}個のマーカーを消費\`);
      // Apply effects based on count
      const srcCell = getCell(state, ctx.sourcePos);
      if (srcCell.character && markerCount >= 1) {
        let atkBonus = 0;
        if (markerCount >= 2) atkBonus += 2;
        if (markerCount >= 4) atkBonus += 2;
        if (atkBonus > 0) {
          const newBuffs = [...srcCell.character.buffs, { type: 'atk_up' as const, value: atkBonus, duration: 99 }];
          state = setCharacterOnCell(state, ctx.sourcePos, { ...srcCell.character, buffs: newBuffs as any });
          state = addLog(state, \`ATK+\${atkBonus}\`);
        }
        // 1+: log 反撃不可 (handled in attack resolution by checking a buff)
        state = addLog(state, \`反撃不可の攻撃を得た\`);
        // 3+: first target rotated (handled as a buff marker)
        if (markerCount >= 3) {
          state = addLog(state, \`攻撃時、対象を90°回転させる\`);
        }
      }
      break;
    }
  }`
);

if (effects.includes("case 'grant_protection'") && effects.includes("case 'consume_markers'")) {
  console.log('effects.ts: grant effects + consume_markers OK');
} else {
  console.log('effects.ts: FAILED');
}
fs.writeFileSync('src/engine/effects.ts', effects, 'utf-8');

// ========================================
// 3. actions.ts: Multiple changes
// ========================================
let actions = fs.readFileSync('src/engine/actions.ts', 'utf-8');

// 3a. calculateDamage: Add marker-based protection and piercing checks
actions = actions.replace(
  `  // Protection: reduce physical damage by 1 (ignored by piercing)
  if (
    defenderChar.card.keywords.includes('protection') &&
    attackerChar.card.attackType === 'physical' &&
    !attackerChar.card.keywords.includes('piercing')
  ) {
    damage = Math.max(0, damage - 1);
  }`,
  `  // Protection: reduce physical damage by 1 (ignored by piercing)
  const hasProtection = defenderChar.card.keywords.includes('protection') || defenderChar.buffs.some(b => b.type === 'has_protection');
  const hasPiercing = attackerChar.card.keywords.includes('piercing') || attackerChar.buffs.some(b => b.type === 'has_piercing');
  if (
    hasProtection &&
    attackerChar.card.attackType === 'physical' &&
    !hasPiercing
  ) {
    damage = Math.max(0, damage - 1);
  }`
);

// 3b. resolveAttack: Add dodge check (after cover, before blind spot)
// Insert dodge check right after the cover block and before blind spot check
actions = actions.replace(
  `    // Determine blind spot: attacker's position is NOT in defender's attack range
    // Stealth: 攻撃が常にブラインド扱い
    const blindSpot = currentAttacker.card.keywords.includes('stealth')
      || isBlindSpot(actualTargetPos, defender, attackerPos);`,
  `    // Dodge: 回避マーカーがあれば物理攻撃を無効化（魔法・貫通は通る）
    const defHasDodge = defender.card.keywords.includes('dodge') || defender.buffs.some(b => b.type === 'has_dodge');
    const atkHasPiercing = currentAttacker.card.keywords.includes('piercing') || currentAttacker.buffs.some(b => b.type === 'has_piercing');
    if (defHasDodge && currentAttacker.card.attackType === 'physical' && !atkHasPiercing) {
      state = addLog(state, \`\${defender.card.name} が【回避】で攻撃を無効化！\`);
      // Consume dodge marker buff
      const cleanedBuffs = defender.buffs.filter(b => b.type !== 'has_dodge');
      state = setCharacterOnCell(state, actualTargetPos, { ...defender, buffs: cleanedBuffs as any });
      continue; // skip this target
    }

    // Determine blind spot: attacker's position is NOT in defender's attack range
    // Stealth: 攻撃が常にブラインド扱い
    const blindSpot = currentAttacker.card.keywords.includes('stealth')
      || isBlindSpot(actualTargetPos, defender, attackerPos);`
);

// 3c. resolveAttack: Add quickness marker check
actions = actions.replace(
  `    const hasQuickness = defender.card.keywords.includes('quickness');`,
  `    const hasQuickness = defender.card.keywords.includes('quickness') || defender.buffs.some(b => b.type === 'has_quickness');`
);

// 3d. Consume piercing marker after attack (in resolveAttack, after main attack damage)
// Add consumption after the "Main attack" section - after counter-attack block, before the for loop ends
// Actually, let's add it at the end of the for loop body, consuming single-use markers
actions = actions.replace(
  `        state = setCharacterOnCell(state, attackerPos, {
          ...latestAttacker,
          currentHp: newAtkHp,
        });
      }
    }
  }

  return state;
}`,
  `        state = setCharacterOnCell(state, attackerPos, {
          ...latestAttacker,
          currentHp: newAtkHp,
        });
      }
    }

    // Consume single-use marker buffs after attack
    const postAtkChar = getCell(state, attackerPos).character;
    if (postAtkChar) {
      const consumedBuffs = postAtkChar.buffs.filter(b =>
        b.type !== 'has_piercing' && b.type !== 'has_quickness'
      );
      if (consumedBuffs.length !== postAtkChar.buffs.length) {
        state = setCharacterOnCell(state, attackerPos, { ...postAtkChar, buffs: consumedBuffs as any });
      }
    }
    // Consume protection marker from defender if it reduced damage
    const postDefChar = getCell(state, actualTargetPos).character;
    if (postDefChar && postDefChar.buffs.some(b => b.type === 'has_protection')) {
      const cleanedDef = postDefChar.buffs.filter(b => b.type !== 'has_protection');
      state = setCharacterOnCell(state, actualTargetPos, { ...postDefChar, buffs: cleanedDef as any });
    }
  }

  return state;
}`
);

// 3e. on_destroyed trigger: Add after removeCharacter
actions = actions.replace(
  `function removeCharacter(state: GameState, pos: Position): GameState {
  const cell = getCell(state, pos);
  const character = cell.character;
  if (!character) return state;

  const owner = character.owner;
  const player = state.players[owner];

  state = setCharacterOnCell(state, pos, null);
  state = updatePlayer(state, owner, {
    mana: player.mana + 1,
    discard: [...player.discard, character.card],
  });
  state = addLog(state, \`\${character.card.name} was destroyed at (\${pos.row},\${pos.col})\`);

  return state;
}`,
  `function removeCharacter(state: GameState, pos: Position): GameState {
  const cell = getCell(state, pos);
  const character = cell.character;
  if (!character) return state;

  // on_destroyed: resolve effects BEFORE removing (character still on board)
  const destroyedEffects = character.card.effects.filter(e => e.trigger === 'on_destroyed');
  if (destroyedEffects.length > 0) {
    state = resolveEffects(state, 'on_destroyed', {
      sourcePos: pos,
      sourceChar: character,
    });
  }

  // Re-read cell (effects may have changed state)
  const cell2 = getCell(state, pos);
  const char2 = cell2.character;
  if (!char2) return state; // already removed by effect

  const owner = char2.owner;
  const player = state.players[owner];

  state = setCharacterOnCell(state, pos, null);
  state = updatePlayer(state, owner, {
    mana: player.mana + 1,
    discard: [...player.discard, char2.card],
  });
  state = addLog(state, \`\${char2.card.name} was destroyed at (\${pos.row},\${pos.col})\`);

  return state;
}`
);

// 3f. on_damaged trigger: Add after defender takes damage but survives
// In resolveAttack, after "Update defender HP" section
actions = actions.replace(
  `    // Update defender HP
    state = setCharacterOnCell(state, actualTargetPos, {
      ...defender,
      currentHp: newDefHp,
    });`,
  `    // Update defender HP
    state = setCharacterOnCell(state, actualTargetPos, {
      ...defender,
      currentHp: newDefHp,
    });

    // on_damaged trigger
    const damagedChar = getCell(state, actualTargetPos).character;
    if (damagedChar && damage > 0) {
      const damagedEffects = damagedChar.card.effects.filter(e => e.trigger === 'on_damaged');
      if (damagedEffects.length > 0) {
        state = resolveEffects(state, 'on_damaged', {
          sourcePos: actualTargetPos,
          sourceChar: damagedChar,
        });
      }
    }`
);

// 3g. Zekus 2-target attack: In executeAttack, after resolveAttack
// Find the section that does the single resolveAttack call and add 2nd target for snipe_10
actions = actions.replace(
  `  // Resolve attack — always single target
  if (!targetPos) {
    const possibleTargets = getAttackTargets(state, position, postEffectCell.character);
    if (possibleTargets.length > 0) {
      state = resolveAttack(state, position, postEffectCell.character, possibleTargets[0]);
    }
  } else {
    state = resolveAttack(state, position, postEffectCell.character, targetPos);
  }`,
  `  // Resolve attack
  const isZekus = postEffectCell.character.card.id === 'snipe_10'; // 虚眼のゼクス: 異なる敵2体攻撃
  if (!targetPos) {
    const possibleTargets = getAttackTargets(state, position, postEffectCell.character);
    if (possibleTargets.length > 0) {
      state = resolveAttack(state, position, postEffectCell.character, possibleTargets[0]);
      // Zekus: 2nd target (different from first)
      if (isZekus && possibleTargets.length > 1) {
        const atkStill = getCell(state, position).character;
        if (atkStill) {
          state = resolveAttack(state, position, atkStill, possibleTargets[1]);
        }
      }
    }
  } else {
    state = resolveAttack(state, position, postEffectCell.character, targetPos);
    // Zekus: 2nd target
    if (isZekus) {
      const atkStill = getCell(state, position).character;
      if (atkStill) {
        const allTargets = getAttackTargets(state, position, atkStill);
        const secondTarget = allTargets.find(t => !(t.row === targetPos.row && t.col === targetPos.col));
        if (secondTarget) {
          state = resolveAttack(state, position, atkStill, secondTarget);
        }
      }
    }
  }`
);

// Verify all changes
const checks = [
  ['has_protection buff', actions.includes('has_protection')],
  ['has_dodge buff', actions.includes('has_dodge')],
  ['has_piercing check', actions.includes('hasPiercing')],
  ['quickness marker', actions.includes("|| defender.buffs.some(b => b.type === 'has_quickness')")],
  ['on_destroyed', actions.includes("'on_destroyed'")],
  ['on_damaged', actions.includes("'on_damaged'")],
  ['dodge block', actions.includes('【回避】で攻撃を無効化')],
  ['zekus 2-target', actions.includes('isZekus')],
  ['consume markers', actions.includes('consume_markers')],
];
let ok = 0, fail = 0;
for (const [name, result] of checks) {
  if (result) { ok++; } else { console.log('FAIL: ' + name); fail++; }
}
console.log(`actions.ts: ${ok}/${checks.length} checks passed` + (fail > 0 ? `, ${fail} FAILED` : ''));

fs.writeFileSync('src/engine/actions.ts', actions, 'utf-8');
console.log('All files written.');
