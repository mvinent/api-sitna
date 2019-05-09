YUI.add("yuidoc-meta", function(Y) {
   Y.YUIDoc = { meta: {
    "classes": [
        "SITNA.Cfg",
        "SITNA.Consts",
        "SITNA.Map",
        "SITNA.cfg.ClickOptions",
        "SITNA.cfg.ClusterOptions",
        "SITNA.cfg.ClusterStyleOptions",
        "SITNA.cfg.ControlOptions",
        "SITNA.cfg.CoordinatesOptions",
        "SITNA.cfg.DataLoaderOptions",
        "SITNA.cfg.LayerCatalogOptions",
        "SITNA.cfg.LayerOptions",
        "SITNA.cfg.LineStyleOptions",
        "SITNA.cfg.MapControlOptions",
        "SITNA.cfg.MarkerOptions",
        "SITNA.cfg.MarkerStyleOptions",
        "SITNA.cfg.OverviewMapOptions",
        "SITNA.cfg.PointStyleOptions",
        "SITNA.cfg.PolygonStyleOptions",
        "SITNA.cfg.SearchCadastralSource",
        "SITNA.cfg.SearchCadastralSourceExt",
        "SITNA.cfg.SearchMunicipalitySource",
        "SITNA.cfg.SearchOptions",
        "SITNA.cfg.SearchPostalAddressSource",
        "SITNA.cfg.SearchQueryProperties",
        "SITNA.cfg.SearchStreetSource",
        "SITNA.cfg.SearchSuggestionListColor",
        "SITNA.cfg.SearchSuggestionListColorByFeatureType",
        "SITNA.cfg.SearchSuggestionListProperties",
        "SITNA.cfg.SearchTownSource",
        "SITNA.cfg.StreetViewOptions",
        "SITNA.cfg.StyleOptions",
        "SITNA.cfg.WMSGroupOptions",
        "SITNA.cfg.WMSOptions",
        "SITNA.consts.Geom",
        "SITNA.consts.Layer",
        "SITNA.consts.LayerType",
        "SITNA.consts.MimeType"
    ],
    "modules": [
        "1. Direcciones de la API",
        "2. Configuración",
        "2.1. Parámetros del constructor",
        "2.2. Maquetación",
        "2.3. Objeto de configuración global",
        "2.3.1. Objeto de configuración de opciones del buscador",
        "3. Clases CSS",
        "3.1. layerCatalog",
        "4. Historial de cambios"
    ],
    "allModules": [
        {
            "displayName": "1. Direcciones de la API",
            "name": "1. Direcciones de la API",
            "description": "La dirección principal de acceso a la API es **[//sitna.tracasa.es/api/](//sitna.tracasa.es/api/)**. No obstante, hay otras direcciones disponibles para\notras necesidades concretas:\n\n- Lógica de la API compilada en un solo archivo:\n  + OpenLayers 4 como motor, minimizada: [//sitna.tracasa.es/api/sitna.ol.min.js](//sitna.tracasa.es/api/sitna.ol.min.js).\n  + OpenLayers 4 como motor, sin minimizar: [//sitna.tracasa.es/api/sitna.ol.debug.js](//sitna.tracasa.es/api/sitna.ol.debug.js).\n  + OpenLayers 2 como motor, minimizada: [//sitna.tracasa.es/api/sitna.ol2.min.js](//sitna.tracasa.es/api/sitna.ol2.min.js).\n  + OpenLayers 2 como motor, sin minimizar: [//sitna.tracasa.es/api/sitna.ol2.debug.js](//sitna.tracasa.es/api/sitna.ol2.debug.js).\n\n- Lógica de la API repartida en varios archivos que se solicitan bajo demanda. En este caso se utiliza OpenLayers 4 como motor a no ser que el navegador sea incompatible,\n en cuyo caso será OpenLayers 2:\n  + Minimizada: [//sitna.tracasa.es/api/sitna.min.js](//sitna.tracasa.es/api/sitna.min.js).\n  + Sin minimizar: [//sitna.tracasa.es/api/sitna.js](//sitna.tracasa.es/api/sitna.js).\n\n_Aviso: a las opciones basadas en OpenLayers 2 se les ha retirado el soporte desde la versión 1.1.0 de la API SITNA._"
        },
        {
            "displayName": "2. Configuración",
            "name": "2. Configuración",
            "description": "Para modificar el aspecto y los datos del mapa existen varias opciones de configuración. Estas opciones se le pueden pasar por tres medios\nno excluyentes. Son los siguientes:\n\n1. Parámetros del constructor de [SITNA.Map](../classes/SITNA.Map.html).\n2. Maquetación del visor (ver [SITNA.Cfg.layout](../classes/SITNA.Cfg.html#property_layout)).\n3. Objeto de configuración global (ver [SITNA.Cfg](../classes/SITNA.Cfg.html)).\n\nEsta lista está ordenada por orden de mayor a menor prevalencia, de manera que si una configuración por un medio entra en conflicto por otra los\nconflictos se resuelven en ese orden."
        },
        {
            "displayName": "2.1. Parámetros del constructor",
            "name": "2.1. Parámetros del constructor",
            "description": "Al instanciar {{#crossLink \"SITNA.Map\"}}{{/crossLink}} se le puede pasar como parámetro un objeto de opciones con la estructura de la clase [SITNA.Cfg](../classes/SITNA.Cfg.html):\n#### Ejemplo:\n```javascript\nvar map = new SITNA.Map(\"mapa\", {\n  crs: \"EPSG:4326\",\n  initialExtent: [\n    -2.84820556640625,\n    41.78912492257675,\n    -0.32135009765625,\n    43.55789822064767\n  ]\n});\n```"
        },
        {
            "displayName": "2.2. Maquetación",
            "name": "2.2. Maquetación",
            "description": "Cuando se instancia un mapa, se carga una maquetación que establece qué datos se cargan, qué controles y en que distribución se muestran, y qué estilo\nva a tener el visor. La API SITNA tiene una maquetación definida por defecto, pero esto se puede cambiar utilizando la opción\n{{#crossLink \"SITNA.Cfg/layout:property\"}}{{/crossLink}}:\n#### Ejemplo:\n```javascript\nvar map = new SITNA.Map(\"mapa\", {\n  layout: \"layouts/mylayout\"\n});\n```\n\nEl valor de esa opción es una ruta a una carpeta, donde se encontrarán todos o alguno de los siguientes archivos:\n\n- `markup.html`, con la plantilla HTML que se inyectará en el elemento del DOM del mapa.\n- `config.json`, con un objeto JSON que sobreescribirá propiedades de {{#crossLink \"SITNA.Cfg\"}}{{/crossLink}}.\n- `style.css`, para personalizar el estilo del visor y sus controles.\n- `script.js`, para añadir lógica nueva. Este es el lugar idóneo para la lógica de la nueva interfaz definida por el marcado inyectado con `markup.html`.\n- `ie8.css`, para adaptar el estilo a Internet Explorer 8, dado que este navegador tiene soporte CSS3 deficiente.\n- `resources/*.json`, donde `*` es el código IETF del idioma que tendrá la interfaz de usuario, por ejemplo `resources/es-ES.json`.\n Si se van a soportar varios idiomas hay que preparar un archivo por idioma. Para saber cómo establecer un idioma de interfaz de usuario, consultar\n la opción `locale` del constructor de {{#crossLink \"SITNA.Map\"}}{{/crossLink}}.\n\nLa maquetación por defecto añade los siguientes controles al conjunto por defecto: {{#crossLink \"SITNA.cfg.MapControlOptions/navBar:property\"}}{{/crossLink}},\n{{#crossLink \"SITNA.cfg.MapControlOptions/basemapSelector:property\"}}{{/crossLink}}, {{#crossLink \"SITNA.cfg.MapControlOptions/TOC:property\"}}{{/crossLink}},\n{{#crossLink \"SITNA.cfg.MapControlOptions/legend:property\"}}{{/crossLink}}, {{#crossLink \"SITNA.cfg.MapControlOptions/scaleBar:property\"}}{{/crossLink}},\n{{#crossLink \"SITNA.cfg.MapControlOptions/search:property\"}}{{/crossLink}}, {{#crossLink \"SITNA.cfg.MapControlOptions/streetView:property\"}}{{/crossLink}}\n, {{#crossLink \"SITNA.cfg.MapControlOptions/measure:property\"}}{{/crossLink}}, {{#crossLink \"SITNA.cfg.MapControlOptions/overviewMap:property\"}}{{/crossLink}} y {{#crossLink \"SITNA.cfg.MapControlOptions/popup:property\"}}{{/crossLink}}.\nPuede [descargar la maquetación por defecto](../../tc/layout/responsive/responsive.zip).\n\n### Soporte multiidioma\n\nLa API soporta actualmente tres idiomas: castellano, euskera e inglés. Para saber cómo establecer un idioma de interfaz de usuario, consultar la opción\n`locale` del constructor de {{#crossLink \"SITNA.Map\"}}{{/crossLink}}. Los textos específicos para cada idioma se guardan en archivos `*.json`,\ndonde `*` es el código IETF del idioma de la interfaz de usuario, dentro de la subcarpeta resources en la dirección donde se aloja la API SITNA.\nPor ejemplo, los textos en castellano se guardan en `resources/es-ES.json`. Estos archivos contienen un diccionario en formato JSON de pares clave/valor,\nsiendo la clave un identificador único de cadena y el valor el texto en el idioma elegido.\n\nPara añadir soporte multiidioma a la maquetación, hay que crear un archivo de recursos de texto para cada idioma soportado y colocarlo en la subcarpeta\n`resources` dentro de la carpeta de maquetación. Este diccionario se combinará con el diccionario de textos propio de la API.\n\nPor otro lado, la plantilla contenida en `markup.html` puede tener identificadores de cadena de texto entre dobles llaves. La API\nsustituirá estos textos por los valores del diccionario correspondiente al idioma de la interfaz de usuario.\n\nFinalmente, hay que activar el soporte multiidioma añadiendo a config.json una clave `\"i18n\": true`."
        },
        {
            "displayName": "2.3. Objeto de configuración global",
            "name": "2.3. Objeto de configuración global",
            "description": "Un objeto {{#crossLink \"SITNA.Cfg\"}}{{/crossLink}} está accesible para todas las instancias del la clase {{#crossLink \"SITNA.Map\"}}{{/crossLink}}.\n\nPor tanto, se puede configurar un mapa asignando valores a las propiedades de ese objeto:\n  #### Ejemplo:\n\n```javascript\nSITNA.Cfg.crs = \"EPSG:4326\";\nSITNA.Cfg.initialExtent = [\n  -2.84820556640625,\n  41.78912492257675,\n  -0.32135009765625,\n  43.55789822064767\n];\nvar map = new SITNA.Map(\"mapa\");\n```"
        },
        {
            "displayName": "2.3.1. Objeto de configuración de opciones del buscador",
            "name": "2.3.1. Objeto de configuración de opciones del buscador",
            "description": "La configuración por defecto de {{#crossLink \"SITNA.cfg.SearchOptions\"}}{{/crossLink}} tiene como origen de datos el WFS de IDENA. Es posible establecer un origen de datos distinto en el que consultar, para ello en lugar de indicar un booleano, que activa o desactiva la búsqueda, se indicará un objeto con las propiedades a sobrescribir. Las propiedades a sobrescribir no siempre serán las mismas, variarán en función de la configuración que tenga la búsqueda que se quiera modificar."
        },
        {
            "displayName": "3. Clases CSS",
            "name": "3. Clases CSS",
            "description": "Para crear la interfaz de usuario, la API SITNA dibuja en la página una gran cantidad de elementos HTML. Para marcarlos como elementos de la\ninterfaz de usuario de los objetos de la API SITNA, se les añade una serie de clases CSS con un nombre convenido, de forma que es fácil modificar\nel aspecto de los controles de la API mediante reglas CSS, e identificar elementos de interfaz mediante selectores CSS.\n\nEl nombre de las clases CSS usadas en la API SITNA es sistemático: todas empiezan con el prefijo `tc-`, y si un elemento está anidado dentro de otro,\ngeneralmente su nombre empieza con el nombre del elemento padre (p.e. el elemento con la clase `tc-ctl-lcat-search` está dentro del elemento\ncon la clase `tc-ctl-lcat`). Esta no es una regla estricta, porque ciertos elementos son muy genéricos y tienen un nombre más sencillo\n(p. e., dentro de un elemento con clase `tc-ctl-lcat` existe un elemento con clase `tc-textbox`, que se utiliza para dar estilo a todas las cajas\nde texto de la API SITNA).\n\nAparte de las clases CSS que definen elementos de la interfaz de usuario, hay otras clases CSS que definen estados de elementos que son relevantes\ndesde el punto de vista de esa interfaz (p. e., el elemento está oculto, o es un nodo de un árbol que está replegado, o es una herramienta que está\nactiva).\n\nEn general, cualquier cambio de estado en la interfaz de usuario se define añadiendo o quitando clases de este tipo a elementos HTML de la aplicación\n(p. e., si un elemento debe ocultarse de la interfaz, en vez de ponerle una regla de estilo `display:none` la API le añade la clase `tc-hidden`).\n\nPara comprobar la estructura de elementos HTML y clases CSS de los controles de la API SITNA puede consultar el siguiente\n[ejemplo](../../examples/CSS.html)."
        },
        {
            "displayName": "3.1. layerCatalog",
            "name": "3.1. layerCatalog",
            "description": "A continuación se describen todas las clases CSS que definen la estructura y/o afectan el comportamiento y aspecto del control\n{{#crossLink \"SITNA.cfg.MapControlOptions/layerCatalog:property\"}}{{/crossLink}}.\n\n## Clases que definen elementos de interfaz\n\n| Clase CSS | Función que desempeña el elemento que tiene la clase |\n|-----------|------------------------------------------------------|\n| `tc-map` | Interfaz de una instancia de la clase SITNA.Map. Generalmente un `<div>`, es el elemento cuyo id se pasa como parámetro al constructor de la clase SITNA.Map. En él se dibuja el viewport del mapa y todos los elementos del layout. |\n| `tc-ctl` | Interfaz de un control. Los controles se renderizan en un elemento definido por la opción div de la configuración propia del control. |\n| `tc-ctl-lcat` | Interfaz del control layerCatalog. |\n| `tc-ctl-lcat-search` | Parte de la interfaz que contiene el buscador de capas disponibles, con su cuadro de texto y su lista de resultados. |\n| `tc-group` | Un elemento de interfaz que contiene un grupo de subelementos. |\n| `tc-ctl-lcat-input` | Un elemento de introducción de texto en el control layerCatalog. |\n| `tc-textbox` | Un elemento de introducción de texto de un control. |\n| `tc-ctl-lcat-search-group` | En los resultados de búsqueda de capas, el conjunto de resultados que se corresponden con uno de los nodos raíz del árbol de capas disponibles. En la práctica, suele ser el conjunto de resultados de búsqueda de uno de los servicios WMS que tenemos añadidos al catálogo. |\n| `tc-ctl-lcat-search-btn-info` | Botón junto al nombre de la capa que nos abre el panel de información adicional de la capa. |\n| `tc-ctl-lcat-tree` | Elemento donde se muestra el árbol de capas disponibles. |\n| `tc-ctl-lcat-branch` | Lista de nodos del árbol de capas disponibles. |\n| `tc-ctl-lcat-node` | Nodo del árbol de capas disponibles. |\n| `tc-ctl-lcat-info` | Panel que muestra información adicional de la capa (descripción, enlaces a metadatos) |\n| `tc-ctl-lcat-info-close` | Botón para cerrar el panel de información adicional de la capa |\n| `tc-ctl-lcat-title` | En el panel de información adicional de la capa, título de la capa |\n| `tc-ctl-lcat-abstract` | Texto descriptivo de la capa. |\n| `tc-ctl-lcat-metadata` | Sección con los enlaces a los metadatos de la capa. |\n\n## Clases que definen estados\n\n| Clase CSS | Función que desempeña el elemento que tiene la clase |\n|-----------|------------------------------------------------------|\n| `tc-collapsed` | Un elemento desplegable de la interfaz (por ejemplo, una rama del árbol de capas disponibles) está replegado. |\n| `tc-checked` | En un nodo de capas disponibles, indica que la capa ya está añadida. |\n| `tc-hidden` | El elemento está oculto a la vista del usuario. |\n| `tc-selectable` | El elemento corresponde a una capa que es elegible para ser añadida al mapa. |\n| `tc-loading` | El elemento es un nodo del árbol o de los resultados de búsqueda que ha sido seleccionado por el usuario para añadirse al mapa, pero la carga de la capa en el mapa no ha terminado todavía. |\n| `tc-active` | Elemento biestado que está activo. Por ejemplo, el botón del idioma en el que está el visor actualmente. |\n  \n#### Ejemplo:\n\n```javascript\n   <div id=\"catalog\" class=\"tc-ctl tc-ctl-lcat\">\n     <h2>Capas disponibles<button class=\"tc-ctl-lcat-btn-search\" title=\"Buscar capas por texto\"></button></h2>\n     <div class=\"tc-ctl-lcat-search tc-hidden tc-collapsed\">\n       <div class=\"tc-group\"><input type=\"search\" class=\"tc-ctl-lcat-input tc-textbox\" placeholder=\"Texto para buscar en las capas\"></div>\n       <ul></ul>\n     </div>\n     <div class=\"tc-ctl-lcat-tree\">\n       <ul class=\"tc-ctl-lcat-branch\">\n         <li class=\"tc-ctl-lcat-node\" data-tc-layer-name=\"\" data-tc-layer-uid=\"10\"><span>IDENA</span>\n           <ul class=\"tc-ctl-lcat-branch\">\n             <li class=\"tc-ctl-lcat-node tc-collapsed\" data-tc-layer-name=\"nombresGeograficos\" data-tc-layer-uid=\"656\"><span data-tooltip=\"Pulse para añadir al mapa\" class=\"tc-selectable\">Nombres geográficos</span><button class=\"tc-ctl-lcat-btn-info\"></button>\n               <ul class=\"tc-ctl-lcat-branch tc-collapsed\">\n                 <li class=\"tc-ctl-lcat-node tc-collapsed\" data-tc-layer-name=\"IDENA:toponimia\" data-tc-layer-uid=\"657\"><span data-tooltip=\"Pulse para añadir al mapa\" class=\"tc-selectable\">Toponimia</span><button class=\"tc-ctl-lcat-btn-info\"></button>\n                   <ul class=\"tc-ctl-lcat-branch tc-collapsed\">\n                     <li class=\"tc-ctl-lcat-node tc-ctl-lcat-leaf\" data-tc-layer-name=\"IDENA:TOPONI_Txt_Toponimos\" data-tc-layer-uid=\"658\"><span data-tooltip=\"Pulse para añadir al mapa\" class=\"tc-selectable\">Nombres de lugar (topónimos)</span><button class=\"tc-ctl-lcat-btn-info\"></button>\n                       <ul class=\"tc-ctl-lcat-branch tc-collapsed\"></ul>\n                     </li>\n                   </ul>\n                 </li>\n               </ul>\n             </li>\n           </ul>\n         </li>\n         <li class=\"tc-ctl-lcat-node tc-collapsed\" data-tc-layer-name=\"\" data-tc-layer-uid=\"962\"><span>IGN - Unidades administrativas</span>\n           <ul class=\"tc-ctl-lcat-branch tc-collapsed\">\n             <li class=\"tc-ctl-lcat-node tc-ctl-lcat-leaf\" data-tc-layer-name=\"AU.AdministrativeBoundary\" data-tc-layer-uid=\"963\"><span data-tooltip=\"Pulse para añadir al mapa\" class=\"tc-selectable\">Límite administrativo</span><button class=\"tc-ctl-lcat-btn-info\"></button>\n               <ul class=\"tc-ctl-lcat-branch tc-collapsed\"></ul>\n             </li>\n             <li class=\"tc-ctl-lcat-node tc-ctl-lcat-leaf\" data-tc-layer-name=\"AU.AdministrativeUnit\" data-tc-layer-uid=\"964\"><span data-tooltip=\"Pulse para añadir al mapa\" class=\"tc-selectable\">Unidad administrativa</span><button class=\"tc-ctl-lcat-btn-info\"></button>\n               <ul class=\"tc-ctl-lcat-branch tc-collapsed\"></ul>\n             </li>\n           </ul>\n         </li>\n       </ul>\n     </div>\n     <div class=\"tc-ctl-lcat-info tc-hidden\"><a class=\"tc-ctl-lcat-info-close\"></a>\n       <h2>Información de capa</h2>\n       <h3 class=\"tc-ctl-lcat-title\"></h3>\n     </div>\n   </div>\n    ```"
        },
        {
            "displayName": "4. Historial de cambios",
            "name": "4. Historial de cambios",
            "description": "### 1.6.0\n\n- Añadida capacidad de compartir entidades vectoriales.\n- Cambiada interfaz de usuario del control de información del mapa.\n- Añadido control de dibujo y medida.\n- Añadido control con herramientas para aplicar a una entidad geográfica: zoom, compartir, descargar, borrar.\n- Corrección de errores.\n\n### 1.5.1\n\n- Cambiada la interfaz de usuario del control de mapas de fondo para mostrar una preselección de mapas.\n- Corrección de errores.\n\n### 1.5.0\n\n- Añadido el control de catálogo de capas.\n- Añadido el control de administración de capas de trabajo.\n- Añadido el control para añadir datos geográficos externos.\n- Añadido el control de impresión de mapas en PDF.\n- Las capas de tipo VECTOR soportan más formatos de archivos geográficos.\n- Se ha eliminado la limitación de extensión máxima por defecto del mapa.\n- Corrección de errores.\n\n### 1.4.0\n\n- Añadida la capacidad de cambiar la proyección del mapa.\n- Añadidos mapas de fondo de OpenStreetMap, Carto y Mapbox.\n- Mejora de soporte a peticiones CORS.\n- Corrección de errores.\n\n### 1.3.0\n\n- Añadida opción de clustering para capas de puntos.\n- Añadido soporte multiidioma.\n- El control de búsqueda soporta nuevos tipos de búsqueda: vías, direcciones postales y parcelas catastrales.\n- Mejora de soporte a peticiones CORS.\n- Corrección de errores.\n\n### 1.2.2\n\n- Actualización a OpenLayers 4.\n- Corrección de errores.\n\n### 1.2.1\n\n- Corrección de errores.\n\n### 1.2.0\n\n- Añadida la capacidad de exportar el mapa a una imagen.\n- Añadido a la documentación ejemplo de exportación de imagen.\n- El control {{#crossLink \"SITNA.cfg.MapControlOptions/featureInfo:property\"}}{{/crossLink}} permite compartir entidades geográficas o descargarlas en distintos formatos.\n- Corrección de errores.\n\n### 1.1.3\n\n- Añadidos a la clase {{#crossLink \"SITNA.Map\"}}{{/crossLink}} métodos de consulta y visualización de entidades geográficas.\n- Añadidos ejemplos a la documentación para los métodos anteriores.\n- Mejorada la interfaz del control de búsquedas añadiendo a los resultados distinción por tipo.\n- Añadido registro centralizado de errores JavaScript.\n- Corrección de errores.\n\n### 1.1.2\n\n- El control {{#crossLink \"SITNA.cfg.MapControlOptions/featureInfo:property\"}}{{/crossLink}} pasa a estar incluido por defecto en el mapa.\n- La [página de incrustación de visores con KML](//sitna.tracasa.es/kml/) pasa a usar OpenLayers 3.\n- Correción de errores de la [página de incrustación de visores con KML](//sitna.tracasa.es/kml/).\n- Añadido ejemplo a la documentación de {{#crossLink \"SITNA.cfg.ClickOptions\"}}{{/crossLink}}.\n- Añadido ejemplo a la documentación de {{#crossLink \"SITNA.cfg.CoordinatesOptions\"}}{{/crossLink}}.\n- Mejorada con botones triestado la usabilidad del control de medición.\n- Añadido indicador de carga de los elementos del visor.\n- Añadido registro centralizado de errores JavaScript.\n- Corrección de errores.\n\n### 1.1.1\n\n- Añadido el control de Google StreetView ({{#crossLink \"SITNA.cfg.MapControlOptions/streetView:property\"}}{{/crossLink}}).\n- Añadido el control de gestión de clics en el mapa ({{#crossLink \"SITNA.cfg.MapControlOptions/click:property\"}}{{/crossLink}}).\n- Añadidas [opciones](./classes/SITNA.cfg.CoordinatesOptions.html) de representación de coordenadas en el control {{#crossLink \"SITNA.cfg.MapControlOptions/coordinates:property\"}}{{/crossLink}}.\n- Compatibilidad mejorada con dispositivos móviles.\n- Mejoras de rendimiento en el layout por defecto.\n- Mejoras en la documentación.\n- Corrección de errores.\n\n### 1.1.0\n\n- Mejoras en el control {{#crossLink \"SITNA.cfg.MapControlOptions/featureInfo:property\"}}{{/crossLink}}: visualización de geometrías\n de las entidades geográficas, bocadillo arrastrable.\n- Se retira el soporte a OpenLayers 2.\n- Corrección de errores.\n\n### 1.0.6\n\n- Añadido el control de información de entidades basado en la petición `getFeatureInfo` de WMS, activable con la opción\n SITNA.cfg.MapControlOptions.{{#crossLink \"SITNA.cfg.MapControlOptions/featureInfo:property\"}}{{/crossLink}}.\n- Añadidas las opciones de zoom al método SITNA.Map.{{#crossLink \"SITNA.Map/zoomToMarkers:method\"}}{{/crossLink}}: radio del\n área alrededor del marcador a mostrar y margen a dejar en los bordes.\n- Corregido error en el layout por defecto que impedía la funcionalidad de deslizar dedo para colapsar paneles.\n\n### 1.0.5\n\n- Corregido error que impedía en ver en la tabla de contenidos si una capa cargada es visible a la escala actual.\n- Corregido error que impedía que se pudieran ocultar desde la tabla de contenidos todas las entidades de una capa KML.\n- Correcciones de estilo en Internet Explorer.\n- Eliminada la necesidad de que el mapa de situación tenga un mapa de fondo de los disponibles en el mapa principal.\n- Cambios menores del estilo por defecto.\n\n### 1.0.4\n\n- Añadidas etiquetas `form` en el HTML de la tabla de contenidos.\n- Añadida compatibilidad con OpenLayers 3.\n- Actualizada para la maquetación por defecto la fuente [FontAwesome](http://fortawesome.github.io/Font-Awesome/) a la versión 4.3.0.\n- La leyenda ahora oculta los servicios que no tienen capas visibles.\n- Cambios en el estilo por defecto.\n- Corrección de errores.\n\n### 1.0.3\n\n- Añadida la opción de deshabilitar el zoom en el mapa con la rueda de ratón mediante la propiedad SITNA.Cfg.{{#crossLink \"SITNA.Cfg/mousewWheelZoom:property\"}}{{/crossLink}}.\n- Añadida la posibilidad de mostrar un marcador con su bocadillo de información asociada visible por defecto, mediante la propiedad SITNA.cfg.MarkerOptions.{{#crossLink \"SITNA.cfg.MarkerOptions/showPopup:property\"}}{{/crossLink}}.\n- Corrección de errores.\n\n### 1.0\n\n- Despliegue inicial."
        }
    ]
} };
});