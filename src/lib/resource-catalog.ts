import { createRememberBettyProgram } from './remember-betty';
import {
  createCleaningReliefProgram,
  createHopeCopayProgram,
  createPinkAidProgram,
  createTransitVoucherProgram,
} from './curated-programs';
import type { PatientProfile, ResourceProgram } from './types';

export function getResourceCatalog(patient: PatientProfile | null): ResourceProgram[] {
  const profile = patient || { diagnosis: '', needs: [] };
  return [
    createRememberBettyProgram(profile),
    createHopeCopayProgram(profile),
    createTransitVoucherProgram(profile),
    createCleaningReliefProgram(profile),
    createPinkAidProgram(profile),
  ];
}

export interface ResourceFilters {
  eligibility: 'all' | ResourceProgram['eligibility']['status'];
  category: 'all' | ResourceProgram['category'];
}

export function filterResources(
  resources: ResourceProgram[],
  filters: ResourceFilters
): ResourceProgram[] {
  return resources.filter(
    (resource) =>
      (filters.eligibility === 'all' || resource.eligibility.status === filters.eligibility) &&
      (filters.category === 'all' || resource.category === filters.category)
  );
}

export function resourceCategories(resources: ResourceProgram[]): ResourceProgram['category'][] {
  return Array.from(new Set(resources.map((resource) => resource.category)));
}
