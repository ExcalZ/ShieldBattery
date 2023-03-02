import { RouterContext } from '@koa/router'
import cuid from 'cuid'
import httpErrors from 'http-errors'
import Joi from 'joi'
import sharp from 'sharp'
import {
  AdminAddLeagueResponse,
  AdminGetLeaguesResponse,
  GetLeaguesListResponse,
  LEAGUE_IMAGE_HEIGHT,
  LEAGUE_IMAGE_WIDTH,
  ServerAdminAddLeagueRequest,
  toLeagueJson,
} from '../../../common/leagues'
import { ALL_MATCHMAKING_TYPES } from '../../../common/matchmaking'
import transact from '../db/transaction'
import { writeFile } from '../file-upload'
import { handleMultipartFiles } from '../file-upload/handle-multipart-files'
import { httpApi, httpBeforeAll } from '../http/http-api'
import { httpBefore, httpGet, httpPost } from '../http/route-decorators'
import { checkAllPermissions } from '../permissions/check-permissions'
import ensureLoggedIn from '../session/ensure-logged-in'
import { validateRequest } from '../validation/joi-validator'
import {
  createLeague,
  getAllLeagues,
  getCurrentLeagues,
  getFutureLeagues,
  getPastLeagues,
} from './league-models'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

@httpApi('/leagues/')
export class LeagueApi {
  @httpGet('/')
  async getLeagues(ctx: RouterContext): Promise<GetLeaguesListResponse> {
    const now = new Date()
    const [past, current, future] = await Promise.all([
      getPastLeagues(now),
      getCurrentLeagues(now),
      getFutureLeagues(now),
    ])
    return {
      past: past.map(l => toLeagueJson(l)),
      current: current.map(l => toLeagueJson(l)),
      future: future.map(l => toLeagueJson(l)),
    }
  }
}

@httpApi('/admin/leagues/')
@httpBeforeAll(ensureLoggedIn, checkAllPermissions('manageLeagues'))
export class LeagueAdminApi {
  @httpGet('/')
  async getLeagues(ctx: RouterContext): Promise<AdminGetLeaguesResponse> {
    const leagues = await getAllLeagues()
    return { leagues: leagues.map(l => toLeagueJson(l)) }
  }

  @httpPost('/')
  @httpBefore(handleMultipartFiles(MAX_IMAGE_SIZE))
  async addLeague(ctx: RouterContext): Promise<AdminAddLeagueResponse> {
    const { body } = validateRequest(ctx, {
      body: Joi.object<ServerAdminAddLeagueRequest & { image: any }>({
        name: Joi.string().required(),
        matchmakingType: Joi.valid(...ALL_MATCHMAKING_TYPES).required(),
        description: Joi.string().required(),
        signupsAfter: Joi.date().timestamp().min(Date.now()).required(),
        startAt: Joi.date().timestamp().min(Date.now()).required(),
        endAt: Joi.date().timestamp().min(Date.now()).required(),
        rulesAndInfo: Joi.string(),
        link: Joi.string(),
        image: Joi.any(),
      }),
    })

    if (body.signupsAfter > body.startAt) {
      throw new httpErrors.BadRequest('signupsAfter must be before startAt')
    } else if (body.startAt > body.endAt) {
      throw new httpErrors.BadRequest('startAt must be before endAt')
    }

    const file = ctx.request.files?.image
    let image: sharp.Sharp | undefined
    let imageExtension: string | undefined
    if (file && Array.isArray(file)) {
      throw new httpErrors.BadRequest('only one image file can be uploaded')
    } else if (file) {
      image = sharp(file.filepath)
      const metadata = await image.metadata()

      if (metadata.format !== 'jpg' && metadata.format !== 'jpeg' && metadata.format !== 'png') {
        image.toFormat('png')
        imageExtension = 'png'
      } else {
        imageExtension = metadata.format
      }

      image.resize(LEAGUE_IMAGE_WIDTH, LEAGUE_IMAGE_HEIGHT, {
        fit: sharp.fit.cover,
        withoutEnlargement: true,
      })
    }

    return await transact(async client => {
      let imagePath: string | undefined
      if (image) {
        const imageId = cuid()
        // Note that cuid ID's are less random at the start so we use the end instead
        const firstChars = imageId.slice(-4, -2)
        const secondChars = imageId.slice(-2)
        imagePath = `league-images/${firstChars}/${secondChars}/${imageId}.${imageExtension}`
      }

      const league = await createLeague(
        {
          ...body,
          imagePath,
        },
        client,
      )

      if (image && imagePath) {
        const buffer = await image.toBuffer()
        writeFile(imagePath, buffer)
      }

      return {
        league: toLeagueJson(league),
      }
    })
  }
}
