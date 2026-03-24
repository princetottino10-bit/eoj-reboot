/**
 * エンジン更新スクリプト v2
 * - consume_markers: マーカーを自分に集める方式に変更
 * - brainwash: 永続バフ追加 + ミスズ死亡時解除
 * - カイザー: 隣接召喚時ドロー
 * - ミスズ: 洗脳キャラ全員攻撃
 * - cards.ts: Kaiser効果修正
 */
const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, label, oldStr, newStr) {
  let src = fs.readFileSync(filePath, 'utf-8');
  const idx = src.indexOf(oldStr);
  if (idx === -1) {
    console.error(`[FAIL] ${label}: old string not found in ${path.basename(filePath)}`);
    console.error(`  Looking for: ${oldStr.substring(0, 100)}...`);
    return false;
  }
  src = src.substring(0, idx) + newStr + src.substring(idx + oldStr.length);
  fs.writeFileSync(filePath, src, 'utf-8');
  console.log(`[OK] ${label}`);
  return true;
}

const gameTs = path.join(__dirname, '..', 'src', 'types', 'game.ts');
const cardsTs = path.join(__dirname, '..', 'src', 'data', 'cards.ts');
const effectsTs = path.join(__dirname, '..', 'src', 'engine', 'effects.ts');
const actionsTs = path.join(__dirname, '..', 'src', 'engine', 'actions.ts');
const aiTs = path.join(__dirname, '..', 'src', 'engine', 'minimax-ai.ts');

// ============================================================
// 1. game.ts: Add 'brainwashed' to Buff type
// ============================================================
replaceInFile(gameTs, 'game.ts: add brainwashed buff',
  `type: 'atk_up' | 'atk_down' | 'sealed' | 'frozen' | 'direction_locked' | 'atk_cost_reduction' | 'has_protection' | 'has_dodge' | 'has_piercing' | 'has_quickness';`,
  `type: 'atk_up' | 'atk_down' | 'sealed' | 'frozen' | 'direction_locked' | 'atk_cost_reduction' | 'has_protection' | 'has_dodge' | 'has_piercing' | 'has_quickness' | 'brainwashed';`
);

// ============================================================
// 2. cards.ts: Fix Kaiser's discard_draw → skip_draw
// ============================================================
replaceInFile(cardsTs, 'cards.ts: Kaiser skip_draw fix',
  `{ trigger: 'on_turn_start', target: 'self', effect: 'discard_draw', value: 99,
      description: '【選択】手札から任意の枚数をデッキに戻す。1枚以上戻したら攻撃コスト-2' },`,
  `{ trigger: 'on_turn_start', target: 'self', effect: 'skip_draw', value: 99,
      description: '【選択】手札から任意の枚数をデッキに戻す。1枚以上戻したら攻撃コスト-2' },`
);

// ============================================================
// 3. effects.ts: Rewrite consume_markers
// ============================================================
replaceInFile(effectsTs, 'effects.ts: rewrite consume_markers',
  `    case 'consume_markers': {
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
    }`,
  `    case 'consume_markers': {
      // アルス専用: 味方のマーカーを全て自分に集める
      const allies = findAllies(state, owner);
      const markerTypes = ['has_protection', 'has_dodge', 'has_piercing', 'has_quickness'] as const;
      const collectedMarkers: Array<{ type: string; value: number; duration?: number }> = [];

      // 味方からマーカーを収集（自分は除く）
      for (const ally of allies) {
        if (ally.pos.row === ctx.sourcePos.row && ally.pos.col === ctx.sourcePos.col) continue;
        const aCell = getCell(state, ally.pos);
        if (aCell.character) {
          const kept: typeof aCell.character.buffs = [];
          for (const b of aCell.character.buffs) {
            if ((markerTypes as readonly string[]).includes(b.type)) {
              collectedMarkers.push({ ...b });
            } else {
              kept.push(b);
            }
          }
          if (kept.length !== aCell.character.buffs.length) {
            state = setCharacterOnCell(state, ally.pos, { ...aCell.character, buffs: kept as any });
          }
        }
      }

      const markerCount = collectedMarkers.length;
      state = addLog(state, \`盟約の収穫: 味方から\${markerCount}個のマーカーを集めた\`);

      // マーカーを自分に付与
      const srcCell = getCell(state, ctx.sourcePos);
      if (srcCell.character && markerCount > 0) {
        const newBuffs = [...srcCell.character.buffs, ...collectedMarkers as any];
        // ATKボーナス: 2個以上→+2、4個以上→さらに+2
        let atkBonus = 0;
        if (markerCount >= 2) atkBonus += 2;
        if (markerCount >= 4) atkBonus += 2;
        if (atkBonus > 0) {
          newBuffs.push({ type: 'atk_up' as any, value: atkBonus, duration: 99 });
          state = addLog(state, \`ATK+\${atkBonus}\`);
        }
        state = setCharacterOnCell(state, ctx.sourcePos, { ...srcCell.character, buffs: newBuffs as any });
      }
      break;
    }`
);

// ============================================================
// 4. effects.ts: Update brainwash to add 'brainwashed' buff
// ============================================================
replaceInFile(effectsTs, 'effects.ts: brainwash add buff',
  `    case 'brainwash': {
      // 対象を行動済みにする
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character) {
          state = setCharacterOnCell(state, pos, {
            ...cell.character,
            hasActedThisTurn: true,
            hasRotatedThisTurn: true,
          });
          state = addLog(state, \`\${cell.character.card.name} は洗脳された（行動不能）\`);
        }
      }
      break;
    }`,
  `    case 'brainwash': {
      // 対象を行動済みにし、brainwashedバフを付与
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character) {
          const dur = effect.value || 1;
          const newBuffs = [...cell.character.buffs, { type: 'brainwashed' as const, value: 1, duration: dur }];
          state = setCharacterOnCell(state, pos, {
            ...cell.character,
            hasActedThisTurn: true,
            hasRotatedThisTurn: true,
            buffs: newBuffs as any,
          });
          state = addLog(state, \`\${cell.character.card.name} は洗脳された（行動不能）\`);
        }
      }
      break;
    }`
);

// ============================================================
// 5. actions.ts: startTurn - keep brainwashed characters acted
// ============================================================
replaceInFile(actionsTs, 'actions.ts: brainwash in startTurn',
  `      if (cell.character && cell.character.owner === pid) {
        const isFrozen = cell.character.buffs.some(b => b.type === 'frozen');
        return {
          ...cell,
          character: {
            ...cell.character,
            hasActedThisTurn: isFrozen,
            hasRotatedThisTurn: isFrozen,
          },
        };
      }`,
  `      if (cell.character && cell.character.owner === pid) {
        const isFrozen = cell.character.buffs.some(b => b.type === 'frozen');
        const isBrainwashed = cell.character.buffs.some(b => b.type === 'brainwashed');
        const cantAct = isFrozen || isBrainwashed;
        return {
          ...cell,
          character: {
            ...cell.character,
            hasActedThisTurn: cantAct,
            hasRotatedThisTurn: cantAct,
          },
        };
      }`
);

// ============================================================
// 6. actions.ts: removeCharacter - remove brainwash buffs when source dies
// ============================================================
replaceInFile(actionsTs, 'actions.ts: removeCharacter brainwash cleanup',
  `  state = setCharacterOnCell(state, pos, null);
  state = updatePlayer(state, owner, {
    mana: player.mana + 1,
    discard: [...player.discard, char2.card],
  });
  state = addLog(state, \`\${char2.card.name} was destroyed at (\${pos.row},\${pos.col})\`);

  return state;
}`,
  `  state = setCharacterOnCell(state, pos, null);
  state = updatePlayer(state, owner, {
    mana: player.mana + 1,
    discard: [...player.discard, char2.card],
  });
  state = addLog(state, \`\${char2.card.name} was destroyed at (\${pos.row},\${pos.col})\`);

  // ミスズ等が死亡した場合、相手の洗脳バフを全解除
  if (char2.card.effects.some(e => e.effect === 'brainwash')) {
    const enemyId: PlayerId = owner === 0 ? 1 : 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const ch = state.board[r][c].character;
        if (ch && ch.owner === enemyId && ch.buffs.some(b => b.type === 'brainwashed')) {
          const cleaned = ch.buffs.filter(b => b.type !== 'brainwashed');
          state = setCharacterOnCell(state, { row: r, col: c }, { ...ch, buffs: cleaned as any });
          state = addLog(state, \`\${ch.card.name} の洗脳が解除された\`);
        }
      }
    }
  }

  return state;
}`
);

// ============================================================
// 7. actions.ts: executeSummon - Kaiser adjacent draw
// ============================================================
replaceInFile(actionsTs, 'actions.ts: Kaiser adjacent summon draw',
  `  // on_summon エフェクト解決
  state = resolveEffects(state, 'on_summon', {
    sourcePos: position,
    sourceChar: boardChar,
  });`,
  `  // カイザー隣接召喚ドロー: 隣接にaggro_10がいたら1ドロー
  const adjForKaiser = getAdjacentPositions(position);
  for (const adj of adjForKaiser) {
    const adjCell = getCell(state, adj);
    if (adjCell.character
      && adjCell.character.owner === pid
      && adjCell.character.card.id === 'aggro_10'
      && !(adj.row === position.row && adj.col === position.col)
      && !adjCell.character.buffs.some(b => b.type === 'sealed')
    ) {
      const drawnPlayer = drawCards(state.players[pid], 1);
      state = updatePlayer(state, pid, { deck: drawnPlayer.deck, hand: drawnPlayer.hand });
      state = addLog(state, \`\${adjCell.character.card.name} の効果: 隣接召喚で1枚ドロー\`);
      break; // 1回だけ
    }
  }

  // on_summon エフェクト解決
  state = resolveEffects(state, 'on_summon', {
    sourcePos: position,
    sourceChar: boardChar,
  });`
);

// ============================================================
// 8. actions.ts: Misuzu multi-attack on brainwashed enemies
// ============================================================
replaceInFile(actionsTs, 'actions.ts: Misuzu brainwashed attack',
  `  // Mark as acted (if attacker is still alive)
  const updatedCell = getCell(state, position);
  if (updatedCell.character) {
    state = setCharacterOnCell(state, position, {
      ...updatedCell.character,
      hasActedThisTurn: true,
    });
  }

  // Check win condition
  const winner = checkWinCondition(state);
  if (winner !== null) {
    state = { ...state, winner, phase: 'game_over' };
  }

  return state;
}`,
  `  // ミスズ特殊: 洗脳状態の敵全員にも攻撃
  const postMisuzuChar = getCell(state, position).character;
  if (postMisuzuChar && postMisuzuChar.card.id === 'control_07') {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const bwCell = state.board[r][c].character;
        if (bwCell && bwCell.owner !== pid && bwCell.buffs.some(b => b.type === 'brainwashed')) {
          const bwPos = { row: r, col: c };
          // 既にメイン攻撃で攻撃済みの対象はスキップ
          if (targetPos && bwPos.row === targetPos.row && bwPos.col === targetPos.col) continue;
          const atkStill = getCell(state, position).character;
          if (atkStill) {
            state = addLog(state, \`\${atkStill.card.name} が洗脳中の \${bwCell.card.name} を攻撃\`);
            state = resolveAttack(state, position, atkStill, bwPos);
          }
        }
      }
    }
  }

  // Mark as acted (if attacker is still alive)
  const updatedCell = getCell(state, position);
  if (updatedCell.character) {
    state = setCharacterOnCell(state, position, {
      ...updatedCell.character,
      hasActedThisTurn: true,
    });
  }

  // Check win condition
  const winner = checkWinCondition(state);
  if (winner !== null) {
    state = { ...state, winner, phase: 'game_over' };
  }

  return state;
}`
);

// ============================================================
// 9. minimax-ai.ts: Update skip_draw check (already uses skip_draw)
// No change needed since we kept skip_draw as the effect type
// ============================================================

console.log('\n=== エンジン更新完了 ===');
