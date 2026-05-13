export type PageHeaderConfig = {
  title: string;
  subtitle?: string;
  showCreatePurchaseButton?: boolean;
};

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function getPageHeader(pathname: string): PageHeaderConfig {
  const p = normalizePath(pathname);

  if (p.startsWith("/purchases/new")) {
    return {
      title: "Nueva compra",
      subtitle: "Sube una factura, ticket o albarán desde el móvil.",
      showCreatePurchaseButton: false,
    };
  }

  if (p.startsWith("/purchases/") && p !== "/purchases") {
    return {
      title: "Compra",
      subtitle: "Documento, líneas y estado.",
    };
  }

  if (p.startsWith("/purchases")) {
    return {
      title: "Compras",
      subtitle: "Facturas, tickets, albaranes y pedidos.",
    };
  }

  if (p.startsWith("/recipes/") && p !== "/recipes") {
    return {
      title: "Editar receta",
      subtitle: "Escandallo, manufactura y mermas.",
    };
  }

  if (p.startsWith("/recipes")) {
    return {
      title: "Recetas",
      subtitle: "Escandallos, manufactura y margen por plato.",
    };
  }

  if (p.startsWith("/ingredients")) {
    return {
      title: "Ingredientes",
      subtitle: "Precios, unidades y evolución de costes.",
    };
  }

  if (p.startsWith("/suppliers")) {
    return {
      title: "Proveedores",
      subtitle: "Tiendas, distribuidores y contactos.",
    };
  }

  if (p.startsWith("/labor-roles")) {
    return {
      title: "Roles de mano de obra",
      subtitle: "Coste horario por rol; se usa en la manufactura de recetas.",
    };
  }

  if (p.startsWith("/settings")) {
    return {
      title: "Ajustes",
      subtitle: "Configuración del restaurante y usuarios.",
    };
  }

  if (p === "/dashboard" || p === "/") {
    return {
      title: "Panel",
      subtitle: "Resumen de compras, costes y actividad.",
    };
  }

  return {
    title: "Panel",
    subtitle: "Resumen de compras, costes y actividad.",
  };
}
