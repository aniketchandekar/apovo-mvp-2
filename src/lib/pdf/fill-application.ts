import { PDFDocument, StandardFonts } from 'pdf-lib';
import { ApplicationRunError } from '../application-agent/errors';
import type { RememberBettyTemplate } from './template-registry';

export async function fillRememberBettyApplication(
  sourceBytes: Uint8Array,
  template: RememberBettyTemplate,
  values: Record<string, string>
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const document = await PDFDocument.load(sourceBytes);
  const form = document.getForm();
  const font = await document.embedFont(StandardFonts.Helvetica);

  for (const [key, fieldName] of Object.entries(template.fields)) {
    const value = values[key]?.trim();
    if (!value) continue;

    const dropdown = template.dropdownFields[key];
    if (dropdown) {
      if (!dropdown.options.includes(value)) {
        throw new ApplicationRunError('INPUT_INVALID', `The answer for ${key} is not a valid option.`);
      }
      form.getDropdown(fieldName).select(value);
      continue;
    }

    const field = form.getTextField(fieldName);
    if (template.multilineFields.includes(key)) {
      field.enableMultiline();
      field.setFontSize(9);
    } else {
      field.setFontSize(10);
    }
    field.setText(value);
  }

  form.updateFieldAppearances(font);
  const bytes = await document.save();
  return { bytes, pageCount: document.getPageCount() };
}
