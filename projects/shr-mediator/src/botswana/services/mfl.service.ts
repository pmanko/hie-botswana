import { R4 } from '@ahryman40k/ts-fhir-types';
import { v4 as uuid } from 'uuid';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { getBundleEntries, getBundleEntry } from '../../common/utils/fhir';
import config from '../../config';
import { LoggerService } from '../../logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { FhirService } from 'src/common/services/fhir.service';

@Injectable()
export class MflService {
  constructor(
    private readonly logger: LoggerService,
    private readonly httpService: HttpService,
    private readonly fhirService: FhirService,
  ) {}

  private applyFhirIgCompliance(location: R4.ILocation): R4.ILocation {
    // Change contact.name.use from "Official" to "official" if it exists(To Be FHIR IG Compliant)
    const locationData = location as R4.ILocation & {
      contact?: { name?: { use?: string } };
    };
    if (locationData.contact?.name?.use === 'Official') {
      locationData.contact.name.use = 'official';
    }
    return locationData;
  }

  /**
   * Resolves a facility code to a FHIR Location from MFL.
   * Tries the fallback source (facility-registry-mfl) first; if it fails or is not configured,
   * tries the primary MFL API.
   *
   * @param anyCode - Facility identifier (e.g. MFL code)
   * @returns FHIR Location for the facility
   * @throws BadRequestException when location cannot be resolved or no MFL URL is configured
   */
  async getLocationFromMfl(anyCode: string) {
    const mflUrl = config.get('mflUrl');
    const mflFallbackUrl = config.get('mflFallbackUrl');

    const tryUrl = (url: string, label: string): Promise<R4.ILocation> => {
      return this.httpService.axiosRef
        .get<R4.ILocation>(`${url}/location/${anyCode}`, {
          timeout: config.get('bwConfig:requestTimeout'),
        })
        .then(({ data }) => {
          if (
            !(
              typeof data === 'object' &&
              'resourceType' in data &&
              data.resourceType === 'Location'
            )
          ) {
            throw new InternalServerErrorException(
              `Invalid MFL ${label} Response: `,
              JSON.stringify(data),
            );
          }
          return this.applyFhirIgCompliance(data);
        });
    };

    if (mflFallbackUrl) {
      try {
        const data = await tryUrl(mflFallbackUrl, 'Fallback');
        this.logger.log(
          `Retrieved location from MFL fallback service for code: ${anyCode}`,
        );
        return data;
      } catch (err) {
        this.logger.warn(
          `Fallback MFL service failed, trying primary MFL URL: ${err.message}`,
        );
      }
    }

    if (mflUrl) {
      try {
        const data = await tryUrl(mflUrl, 'Primary');
        this.logger.log(
          `Retrieved location from primary MFL service for code: ${anyCode}`,
        );
        return data;
      } catch (err) {
        this.logger.error(`Primary MFL service failed:`, err);
        throw new BadRequestException(
          `Unable to retrieve location from MFL ${anyCode}`,
        );
      }
    }

    throw new BadRequestException(
      `Unable to retrieve location from MFL: no MFL URL configured ${anyCode}`,
    );
  }

  async enrichWithMflData(labOrderBundle: R4.IBundle) {
    // Sync with MFL
    const serviceRequest = labOrderBundle.entry.find(
      ({ resource }) => resource.resourceType === 'ServiceRequest',
    ).resource as R4.IServiceRequest;
    const task = labOrderBundle.entry.find(
      ({ resource }) => resource.resourceType === 'Task',
    ).resource as R4.ITask;

    const regex = /identifier=([^|]+)\|(.+)/;
    const labSiteOrgIdentifier =
      serviceRequest.performer[0].reference.match(regex);
    const labSiteLocIdentifier = task.location.reference.match(regex);
    const orderingOrgIdentifier = task.owner.reference.match(regex);

    if (!labSiteOrgIdentifier) {
      throw new BadRequestException(
        'Unable to extract Lab site identifier from the ServiceRequest.performer',
      );
    }

    if (!labSiteLocIdentifier) {
      throw new BadRequestException(
        'Unable to extract Lab site identifier from the Task.location',
      );
    }

    if (!orderingOrgIdentifier) {
      throw new BadRequestException(
        'Unable to extract ordering HF identifier from the Task.owner',
      );
    }

    if (
      labSiteOrgIdentifier[1] !== labSiteLocIdentifier[1] ||
      labSiteOrgIdentifier[2] !== labSiteLocIdentifier[2]
    ) {
      throw new BadRequestException(
        'Lab site identifier in ServiceRequest.performer does not match the Task.location',
      );
    }

    // Get Data from MFL and create/update Organization and Locations in SHR
    const labSiteLocation = await this.getLocationFromMfl(
      labSiteOrgIdentifier[2],
    );
    const orderingLocation = await this.getLocationFromMfl(
      orderingOrgIdentifier[2],
    );

    const [labSiteOrg, labSiteLoc] =
      this.buildMflBundleEntries(labSiteLocation);
    const [orderingOrg, orderingLoc] =
      this.buildMflBundleEntries(orderingLocation);

    serviceRequest.performer[0].reference = labSiteOrg.fullUrl;
    task.owner.reference = orderingOrg.fullUrl;
    task.location.reference = labSiteLoc.fullUrl;

    return {
      ...labOrderBundle,
      entry: [
        ...labOrderBundle.entry,
        labSiteOrg,
        labSiteLoc,
        orderingOrg,
        orderingLoc,
      ],
    };
  }

  buildMflBundleEntries(location: R4.ILocation): R4.IBundle['entry'] {
    const identifier = location.identifier.find(({ system }) => {
      return system === config.get('bwConfig:mflCodeSystemUrl');
    });

    if (!identifier) {
      throw new InternalServerErrorException(
        'Unable to find MFL system url in response',
      );
    }

    const organization: R4.IOrganization = {
      resourceType: 'Organization',
      id: uuid(),
      identifier: location.identifier,
      name: location.managingOrganization?.display,
      address: [
        {
          city: location.address.city,
          country: location.address.country,
          district: location.address.district,
        },
      ],
      active: true,
    };

    const linkedLocation: R4.ILocation = {
      ...location,
      id: uuid(),
      managingOrganization: {
        reference: `urn:uuid:${organization.id}`,
        display: organization.name,
      },
    };

    return [
      {
        fullUrl: `urn:uuid:${organization.id}`,
        resource: organization,
        request: {
          method: R4.Bundle_RequestMethodKind._put,
          url: `Organization?identifier=${identifier.system}|${identifier.value}`,
        },
      },
      {
        fullUrl: `urn:uuid:${linkedLocation.id}`,
        resource: linkedLocation,
        request: {
          method: R4.Bundle_RequestMethodKind._put,
          url: `Location?identifier=${identifier.system}|${identifier.value}`,
        },
      },
    ];
  }

  //    * This method adds IPMS - specific location mappings to the order bundle based on the ordering
  //   * facility
  //   * @param bundle
  //     * @returns bundle
  //       * /
  // //
  //
  // This method assumes that the Task resource has a reference to the recieving facility
  // under the `owner` field. This is the facility that the lab order is being sent to.
  async mapLocations(bundle: R4.IBundle): Promise<R4.IBundle> {
    this.logger.log('Mapping Locations!');

    let mappedLocation: R4.ILocation | R4.IOrganization | undefined;
    let mappedOrganization: R4.IOrganization | R4.ILocation | undefined;

    try {
      this.logger.log('Adding Location Info to Bundle');

      if (bundle && bundle.entry) {
        const task: R4.ITask = <R4.ITask>getBundleEntry(bundle.entry, 'Task');
        const srs: R4.IServiceRequest[] = <R4.IServiceRequest[]>(
          getBundleEntries(bundle.entry, 'ServiceRequest')
        );

        const orderingLocationRef: R4.IReference | undefined = task.location;

        const srOrganizationRefs: (R4.IReference | undefined)[] = srs.map(
          (sr) => {
            if (sr.requester) {
              return sr.requester;
            } else {
              return undefined;
            }
          },
        );

        const locationId = orderingLocationRef?.reference?.split('/')[1];
        const srOrgIds = srOrganizationRefs.map((ref) => {
          return ref?.reference?.split('/')[1];
        });

        const uniqueOrgIds = Array.from(new Set(srOrgIds));

        if (uniqueOrgIds.length != 1 || !locationId) {
          this.logger.error(
            `Wrong number of ordering Organizations and Locations in this bundle:\n${JSON.stringify(
              uniqueOrgIds,
            )}\n${JSON.stringify(locationId)}`,
          );
        }

        let orderingLocation = <R4.ILocation>(
          getBundleEntry(bundle.entry, 'Location', locationId)
        );

        //@TODO fix
        let orderingOrganization = <R4.IOrganization>(
          getBundleEntry(bundle.entry, 'Organization', uniqueOrgIds[0])
        );

        if (!orderingLocation) {
          this.logger.warn(
            'Could not find ordering Location! Using Omrs Location instead.',
          );
          orderingLocation = <R4.ILocation>(
            getBundleEntry(bundle.entry, 'Location')
          );
        } else if (orderingLocation) {
          if (!orderingOrganization) {
            this.logger.warn(
              'No ordering Organization found - copying location info!',
            );
            orderingOrganization = {
              resourceType: 'Organization',
              id: crypto
                .createHash('md5')
                .update('Organization/' + orderingLocation.name)
                .digest('hex'),
              identifier: orderingLocation.identifier,
              name: orderingLocation.name,
            };
          } else if (
            !orderingLocation.managingOrganization ||
            orderingLocation.managingOrganization.reference?.split('/')[1] !=
              orderingOrganization.id
          ) {
            this.logger.error(
              'Ordering Organization is not the managing Organziation of Location!',
            );
          }

          mappedLocation = await this.translateLocation(orderingLocation);
          mappedOrganization =
            await this.translateLocation(orderingOrganization);

          const mappedLocationRef: R4.IReference = {
            reference: `Location/${mappedLocation.id}`,
          };
          const mappedOrganizationRef: R4.IReference = {
            reference: `Organization/${mappedOrganization.id}`,
          };

          if (mappedLocation.resourceType == 'Location') {
            mappedLocation.managingOrganization = mappedOrganizationRef;
          }
          if (mappedLocation && mappedLocation.id) {
            task.location = mappedLocationRef;

            bundle.entry.push({
              resource: mappedLocation,
              request: {
                method: R4.Bundle_RequestMethodKind._put,
                url: mappedLocationRef.reference,
              },
            });
          }
          if (mappedOrganization && mappedOrganization.id) {
            task.owner = mappedOrganizationRef;
            bundle.entry.push({
              resource: mappedOrganization,
              request: {
                method: R4.Bundle_RequestMethodKind._put,
                url: mappedOrganizationRef.reference,
              },
            });
            for (const sr of srs) {
              sr.performer
                ? sr.performer.push(mappedOrganizationRef)
                : (sr.performer = [mappedOrganizationRef]);
            }
          }
          if (orderingOrganization && orderingOrganization.id) {
            const orderingOrganizationRef: R4.IReference = {
              reference: `Organization/${orderingOrganization.id}`,
            };

            task.requester = orderingOrganizationRef;
          }
          if (orderingLocation && orderingLocation.id) {
            const orderingLocationRef: R4.IReference = {
              reference: `Location/${orderingLocation.id}`,
            };
          }
        }
      }
    } catch (e) {
      this.logger.error(e);
    }

    return bundle;
  }

  /**
   * @param location
   * @returns R4.ILocation
   */
  async translateLocation(
    location: R4.ILocation | R4.IOrganization,
  ): Promise<R4.ILocation | R4.IOrganization> {
    this.logger.log('Translating Location Data');

    const returnLocation: R4.ILocation = {
      resourceType: 'Location',
    };
    let targetMapping: R4.ILocation | R4.IOrganization | null = null;
    try {
      // First, attempt to find the mapping by identifier
      const identifier = location.identifier?.[0];
      if (identifier) {
        this.logger.log(
          `Looking up location by identifier: ${JSON.stringify(identifier)}`,
        );
        const { data: fetchedBundleByIdentifier } =
          await this.httpService.axiosRef.get<R4.IBundle>(
            `${config.get('fhirServer:baseURL')}/${location.resourceType}?identifier=${identifier.value}`,
            {
              timeout: config.get('bwConfig:requestTimeout'),
            }
          );

        if (fetchedBundleByIdentifier.entry?.[0]?.resource) {
          targetMapping = fetchedBundleByIdentifier.entry[0].resource as
            | R4.ILocation
            | R4.IOrganization;
        }
      }

      // If not found, attempt to find the mapping by name
      if (!targetMapping && location.name) {
        this.logger.log(`Looking up location by name: ${location.name}`);
        const { data: fetchedBundleByName } =
          await this.httpService.axiosRef.get<R4.IBundle>(
            `${config.get('fhirServer:baseURL')}/${location.resourceType}?name=${location.name}`,
            {
              timeout: config.get('bwConfig:requestTimeout'),
            }
          );

        if (fetchedBundleByName.entry?.[0]?.resource) {
          targetMapping = fetchedBundleByName.entry[0].resource as R4.ILocation;
        }
      }

      // If target mapping was found, update returnLocation with the target mapping's details
      if (targetMapping) {
        return targetMapping;
      } else {
        this.logger.warn('No matching location found.');
        // Handle the case where no matching location is found
      }
    } catch (error) {
      this.logger.error('Error translating location:', error);
      // Handle the error appropriately
    }

    this.logger.log(`Translated Location:\n${JSON.stringify(returnLocation)}`);
    return returnLocation;
  }
}
