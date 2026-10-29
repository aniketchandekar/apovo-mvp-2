import assert from 'node:assert/strict';
import test from 'node:test';
import { filterResources, getResourceCatalog, resourceCategories } from '../../src/lib/resource-catalog';
import type { PatientProfile } from '../../src/lib/types';

test('catalog shows resources even without a patient profile', () => {
  const resources = getResourceCatalog(null);
  assert.ok(resources.length >= 1);
  assert.equal(resources[0].id, 'remember-betty');
  assert.equal(resources[0].eligibility.status, 'needs_information');
});

test('eligibility and category filters include and exclude correctly', () => {
  const eligible = getResourceCatalog({
    diagnosis: 'Breast cancer',
    needs: ['bills'],
  } as PatientProfile);
  assert.equal(eligible[0].eligibility.status, 'eligible');

  const notEligible = getResourceCatalog({
    diagnosis: 'Lung cancer',
    needs: ['bills'],
  } as PatientProfile);
  assert.equal(notEligible[0].eligibility.status, 'not_eligible');

  const catalog = [...eligible, ...notEligible];
  const eligibleFinancial = filterResources(catalog, { eligibility: 'eligible', category: 'Financial' });
  const notEligibleFinancial = filterResources(catalog, { eligibility: 'not_eligible', category: 'Financial' });
  assert.ok(eligibleFinancial.length >= 1);
  assert.ok(notEligibleFinancial.length >= 1);
  assert.equal(filterResources(catalog, { eligibility: 'all', category: 'Lodging' }).length, 0);
  assert.equal(filterResources(catalog, { eligibility: 'eligible', category: 'Lodging' }).length, 0);
  assert.ok(resourceCategories(catalog).includes('Financial'));
  assert.ok(resourceCategories(catalog).includes('Transport'));
});
