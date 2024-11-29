import whois from 'whois-json';
import dns from 'dns';
import { promisify } from 'util';

const resolveDns = promisify(dns.resolve);

export async function lookupDomain(domain) {
  try {
    // Vérifier d'abord les enregistrements DNS
    try {
      await resolveDns(domain);
      // Si on arrive ici, le domaine a des enregistrements DNS
    } catch (dnsError) {
      return {
        isExpired: true,
        reason: 'Aucun enregistrement DNS trouvé'
      };
    }

    // Vérifier ensuite le WHOIS
    const result = await whois(domain);
    
    if (!result.expirationDate) {
      return {
        isExpired: true,
        reason: 'Pas de date d\'expiration trouvée'
      };
    }

    const expirationDate = new Date(result.expirationDate);
    const now = new Date();
    
    return {
      isExpired: expirationDate < now,
      reason: expirationDate < now ? `Expiré depuis ${expirationDate.toLocaleDateString()}` : null
    };
  } catch (error) {
    console.error(`Erreur lors de la vérification du domaine ${domain}:`, error);
    throw error;
  }
}