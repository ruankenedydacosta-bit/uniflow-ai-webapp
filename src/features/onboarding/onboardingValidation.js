export function validateStep(step, data) {
  switch (step) {
    case 1:
      return { isValid: true, errors: {} };

    case 2:
      if (!data.mode) {
        return { isValid: false, errors: { mode: 'Selecione um modo para continuar' } };
      }
      return { isValid: true, errors: {} };

    case 3:
      if (!data.goal) {
        return { isValid: false, errors: { goal: 'Selecione seu objetivo principal' } };
      }
      if (data.goal === 'outro' && !data.goalText?.trim()) {
        return { isValid: false, errors: { goalText: 'Descreva seu objetivo' } };
      }
      return { isValid: true, errors: {} };

    case 4:
      return { isValid: true, errors: {} };

    case 5:
      if (!data.userTone) {
        return { isValid: false, errors: { userTone: 'Escolha um tom para começar' } };
      }
      return { isValid: true, errors: {} };

    case 6:
      return { isValid: true, errors: {} };

    default:
      return { isValid: false, errors: {} };
  }
}
