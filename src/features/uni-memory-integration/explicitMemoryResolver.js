import { normalizeMemoryText } from '../uni-memory/memoryTypes.js';
import {
  buildMemoryConflictExplanation,
  buildMemoryInfluenceExplanation,
} from './memoryInfluenceExplanation.js';

function memoryValue(memory, ...keys) {
  for (const key of keys) {
    if (memory?.value?.[key] !== undefined) return memory.value[key];
  }
  return null;
}

function transactionType(intent) {
  if (intent === 'register_income') return 'income';
  if (intent === 'register_expense') return 'expense';
  if (intent === 'register_transfer') return 'transfer';
  return null;
}

function findCategory(memory, categories, type) {
  const id = memoryValue(memory, 'category_id', 'categoryId');
  const name = normalizeMemoryText(memoryValue(memory, 'category_name', 'categoryName'));
  return categories.find((category) =>
    category.is_active !== false &&
    (!type || category.category_type === type) &&
    ((id && category.id === id) || (name && normalizeMemoryText(category.name) === name)),
  );
}

function findAccount(memory, accounts) {
  const id = memoryValue(memory, 'account_id', 'accountId');
  const name = normalizeMemoryText(memoryValue(memory, 'account_name', 'accountName'));
  return accounts.find((account) =>
    account.is_active !== false &&
    ((id && account.id === id) ||
      (name && [account.name, account.institution_name].some(
        (value) => normalizeMemoryText(value) === name,
      ))),
  );
}

function matchesTransaction(memory, type) {
  const expected = memoryValue(memory, 'transaction_type', 'transactionType');
  return !expected || expected === type;
}

function merchantMatch(memory, parsed) {
  const merchant = normalizeMemoryText(memoryValue(memory, 'merchant', 'description'));
  return merchant.length >= 3 && normalizeMemoryText(parsed.input).includes(merchant);
}

export function applyExplicitMemories(parsedResult, memoryContext, {
  accounts = [],
  categories = [],
  profileId = 'balanced',
} = {}) {
  const parsed = parsedResult ?? {};
  const entities = { ...(parsed.entities ?? {}) };
  const resolvedResult = { ...parsed, entities };
  const memories = memoryContext?.memories ?? [];
  const type = transactionType(parsed.intent);
  const influences = [];
  const conflicts = [];
  const memoryIds = [];
  const memoryOverrides = {};

  if (!type) {
    return Object.freeze({
      parsedResult,
      resolvedResult: Object.freeze({ ...resolvedResult, entities: Object.freeze(entities) }),
      memoryOverrides: Object.freeze({}),
      influencedFields: Object.freeze([]),
      memoryIds: Object.freeze([]),
      conflicts: Object.freeze([]),
      explanation: '',
    });
  }

  const categoryMemory = memories.find((memory) =>
    memory.type === 'merchant_category_mapping' && merchantMatch(memory, parsed),
  ) ?? memories.find((memory) =>
    memory.type === 'category_preference' && matchesTransaction(memory, type),
  );
  const category = categoryMemory
    ? findCategory(categoryMemory, categories, type)
    : null;
  const currentCategory = normalizeMemoryText(entities.category);

  if (categoryMemory && category) {
    if (currentCategory && currentCategory !== normalizeMemoryText(category.name)) {
      conflicts.push({
        field: 'category',
        memoryId: categoryMemory.id,
        memoryLabel: category.name,
        currentLabel: entities.category,
      });
    } else {
      entities.category = category.name;
      memoryOverrides.categoryId = category.id;
      influences.push({ field: 'category', label: category.name, memoryId: categoryMemory.id });
      memoryIds.push(categoryMemory.id);
    }
  }

  const accountMemory = memories.find((memory) =>
    memory.type === 'account_preference' && matchesTransaction(memory, type),
  );
  const account = accountMemory ? findAccount(accountMemory, accounts) : null;
  const currentAccount = normalizeMemoryText(entities.account);

  if (accountMemory && account) {
    const accountNames = [account.name, account.institution_name].map(normalizeMemoryText);
    if (currentAccount && !accountNames.includes(currentAccount)) {
      conflicts.push({
        field: 'account',
        memoryId: accountMemory.id,
        memoryLabel: account.name,
        currentLabel: entities.account,
      });
    } else if (!currentAccount) {
      entities.account = account.name;
      memoryOverrides.accountId = account.id;
      influences.push({ field: 'account', label: account.name, memoryId: accountMemory.id });
      memoryIds.push(accountMemory.id);
    }
  }

  return Object.freeze({
    parsedResult,
    resolvedResult: Object.freeze({
      ...resolvedResult,
      entities: Object.freeze(entities),
    }),
    memoryOverrides: Object.freeze(memoryOverrides),
    influencedFields: Object.freeze(influences.map((item) => item.field)),
    memoryIds: Object.freeze(memoryIds),
    conflicts: Object.freeze(conflicts.map((conflict) => Object.freeze({
      ...conflict,
      explanation: buildMemoryConflictExplanation(conflict),
    }))),
    explanation: buildMemoryInfluenceExplanation(influences, profileId),
  });
}
