import * as dependencyRepository from '../repositories/contentDependency.repository.js'
import * as moduleRepository from '../repositories/module.repository.js'
import { ApiError } from '../utils/ApiError.js'
import { isForeignKeyViolation, translatePrismaError } from '../utils/prismaErrors.js'
import { assertCourseOwner, canView, visibleChildrenFilter } from './courseAccess.service.js'
import { getOwnedCourse, getVisibleCourse } from './course.service.js'
import { assertNoDependents, deletionBlocked } from './deletionGuard.service.js'

const NOT_FOUND = 'Module not found'

const MODULE_CONFLICTS = {
  modules_course_id_sequence_order_key: {
    field: 'sequenceOrder',
    message: 'Another module in this course already uses this sequence order',
  },
}

const toModuleResponse = ({ course, ...module }) => module

async function findModule(moduleId) {
  const module = await moduleRepository.findModuleById(moduleId)
  if (!module) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return module
}

export async function getVisibleModule(user, moduleId) {
  const module = await findModule(moduleId)
  if (!canView(user, module.course, module)) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return module
}

export async function getOwnedModule(user, moduleId) {
  const module = await findModule(moduleId)
  assertCourseOwner(user, module.course)
  return module
}

export async function createModule(user, courseId, input) {
  await getOwnedCourse(user, courseId)
  const sequenceOrder = input.sequenceOrder ?? (await moduleRepository.findMaxSequenceOrder(courseId)) + 1

  try {
    return await moduleRepository.createModule({ ...input, courseId, sequenceOrder })
  } catch (err) {
    throw translatePrismaError(err, { conflicts: MODULE_CONFLICTS })
  }
}

export async function listModules(user, courseId) {
  const course = await getVisibleCourse(user, courseId)
  return moduleRepository.findModulesByCourse(courseId, visibleChildrenFilter(user, course))
}

export async function getModule(user, moduleId) {
  return toModuleResponse(await getVisibleModule(user, moduleId))
}

export async function updateModule(user, moduleId, input) {
  await getOwnedModule(user, moduleId)

  try {
    return await moduleRepository.updateModule(moduleId, input)
  } catch (err) {
    throw translatePrismaError(err, { conflicts: MODULE_CONFLICTS, notFound: NOT_FOUND })
  }
}

export async function deleteModule(user, moduleId) {
  await getOwnedModule(user, moduleId)
  assertNoDependents('module', await dependencyRepository.countModuleDependents(moduleId))

  try {
    return await moduleRepository.deleteModuleTree(moduleId)
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw deletionBlocked('module')
    }
    throw translatePrismaError(err, { notFound: NOT_FOUND })
  }
}
