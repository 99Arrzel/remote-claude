import { os } from '@orpc/server'
import { type } from 'arktype'
import { getEnv } from '../env'
import { browseDirectory } from './directories-logic'

export const directoriesRouter = os.router({
  browse: os
    .input(type({ path: 'string' }))
    .handler(async ({ input }) => browseDirectory(input.path, getEnv().browseRoot)),
})
