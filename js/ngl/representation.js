/**
 * @file Representation
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */


NGL.SideTypes = {};
NGL.SideTypes[ THREE.FrontSide ] = "front";
NGL.SideTypes[ THREE.BackSide ] = "back";
NGL.SideTypes[ THREE.DoubleSide ] = "double";


NGL.makeRepresentation = function( type, object, viewer, params ){

    if( NGL.debug ) NGL.time( "NGL.makeRepresentation " + type );

    var ReprClass;

    if( type === "buffer" ){

        ReprClass = NGL.BufferRepresentation;

    }else if( object instanceof NGL.Structure ){

        ReprClass = NGL.representationTypes[ type ];

        if( !ReprClass ){

            NGL.error(
                "NGL.makeRepresentation: representation type " + type + " unknown"
            );
            return;

        }

    }else if( object instanceof NGL.Surface || object instanceof NGL.Volume ){

        if( type === "surface" ){

            ReprClass = NGL.SurfaceRepresentation;

        }else if( type === "dot" ){

            ReprClass = NGL.DotRepresentation;

        }else{

            NGL.error(
                "NGL.makeRepresentation: representation type " + type + " unknown"
            );
            return;

        }

    }else if( object instanceof NGL.Trajectory ){

        ReprClass = NGL.TrajectoryRepresentation;

    }else{

        NGL.error(
            "NGL.makeRepresentation: object " + object + " unknown"
        );
        return;

    }

    var repr = new ReprClass( object, viewer, params );

    if( NGL.debug ) NGL.timeEnd( "NGL.makeRepresentation " + type );

    return repr;

};


///////////////////
// Representation

NGL.Representation = function( object, viewer, params ){

    this.viewer = viewer;

    this.queue = new NGL.Queue( this.make.bind( this ) );
    this.tasks = new NGL.Counter();
    this.bufferList = [];

    this.init( params );

};

NGL.Representation.prototype = {

    constructor: NGL.Representation,

    type: "",

    parameters: {

        clipNear: {
            type: "range", step: 1, max: 100, min: 0, buffer: true
        },
        flatShaded: {
            type: "boolean", buffer: true
        },
        opacity: {
            type: "range", step: 0.01, max: 1, min: 0, buffer: true
        },
        side: {
            type: "select", options: NGL.SideTypes, buffer: true,
            int: true
        },
        wireframe: {
            type: "boolean", buffer: true
        },
        linewidth: {
            type: "integer", max: 50, min: 1, buffer: true
        },

        colorScheme: {
            type: "select", update: "color",
            options: NGL.ColorMakerRegistry.getTypes()
        },
        colorScale: {
            type: "select", update: "color",
            options: NGL.ColorMakerRegistry.getScales()
        },
        colorValue: {
            type: "color", update: "color"
        },
        colorDomain: {
            type: "hidden", update: "color"
        },
        colorMode: {
            type: "select", update: "color",
            options: NGL.ColorMakerRegistry.getModes()
        },

        roughness: {
            type: "range", step: 0.01, max: 1, min: 0, buffer: true
        },
        metalness: {
            type: "range", step: 0.01, max: 1, min: 0, buffer: true
        },
        diffuse: {
            type: "color", buffer: true
        },

    },

    init: function( params ){

        var p = params || {};

        this.clipNear = p.clipNear !== undefined ? p.clipNear : 0;
        this.flatShaded = p.flatShaded || false;
        this.side = p.side !== undefined ? p.side : THREE.DoubleSide;
        this.opacity = p.opacity !== undefined ? p.opacity : 1.0;
        this.wireframe = p.wireframe || false;
        this.linewidth = p.linewidth || 2;

        this.setColor( p.color, p );

        this.colorScheme = p.colorScheme || "uniform";
        this.colorScale = p.colorScale || "";
        this.colorValue = p.colorValue || 0x909090;
        this.colorDomain = p.colorDomain || "";
        this.colorMode = p.colorMode || "hcl";

        this.visible = p.visible !== undefined ? p.visible : true;
        this.quality = p.quality;

        this.roughness = p.roughness !== undefined ? p.roughness : 0.4;
        this.metalness = p.metalness !== undefined ? p.metalness : 0.0;
        this.diffuse = p.diffuse !== undefined ? p.diffuse : 0xffffff;

    },

    getColorParams: function(){

        return {

            scheme: this.colorScheme,
            scale: this.colorScale,
            value: this.colorValue,
            domain: this.colorDomain,
            mode: this.colorMode,

        };

    },

    getBufferParams: function( p ){

        return Object.assign( {

            clipNear: this.clipNear,
            flatShaded: this.flatShaded,
            opacity: this.opacity,
            side: this.side,
            wireframe: this.wireframe,
            linewidth: this.linewidth,

            roughness: this.roughness,
            metalness: this.metalness,
            diffuse: this.diffuse,

        }, p );

    },

    setColor: function( value, p ){

        var types = Object.keys( NGL.ColorMakerRegistry.getTypes() );

        if( types.indexOf( value ) !== -1 ){

            if( p ){
                p.colorScheme = value;
            }else{
                this.setParameters( { colorScheme: value } );
            }

        }else if( value !== undefined ){

            value = new THREE.Color( value ).getHex();
            if( p ){
                p.colorScheme = "uniform";
                p.colorValue = value;
            }else{
                this.setParameters( {
                    colorScheme: "uniform", colorValue: value
                } );
            }

        }

        return this;

    },

    prepare: false,

    create: function(){

        // this.bufferList.length = 0;

    },

    update: function(){

        this.build();

    },

    build: function( params ){

        if( !this.prepare ){
            if( !params ){
                params = this.getParameters();
                delete params.quality;
            }
            this.tasks.increment();
            this.make( params, function(){} );
            return;
        }

        // don't let tasks accumulate
        if( this.queue.length() > 0 ){

            this.tasks.change( 1 - this.queue.length() );
            this.queue.kill();

        }else{

            this.tasks.increment();

        }

        if( !params ){
            params = this.getParameters();
            delete params.quality;
        }

        this.queue.push( params );

    },

    make: function( params, callback ){

        if( NGL.debug ) NGL.time( "NGL.Representation.make " + this.type );

        if( params && !params.__update ){
            this.init( params );
        }

        var _make = function(){

            if( params.__update ){
                this.update( params.__update );
                this.viewer.requestRender();
                this.tasks.decrement();
                callback();
            }else{
                this.clear();
                this.create();
                if( !this.manualAttach && !this.disposed ){
                    if( NGL.debug ) NGL.time( "NGL.Representation.attach " + this.type );
                    this.attach( function(){
                        if( NGL.debug ) NGL.timeEnd( "NGL.Representation.attach " + this.type );
                        this.tasks.decrement();
                        callback();
                    }.bind( this ) );
                }
            }

            if( NGL.debug ) NGL.timeEnd( "NGL.Representation.make " + this.type );

        }.bind( this );

        if( this.prepare ){
            this.prepare( _make );
        }else{
            _make();
        }

    },

    attach: function( callback ){

        this.setVisibility( this.visible );

        callback();

    },

    setVisibility: function( value, noRenderRequest ){

        this.visible = value;

        this.bufferList.forEach( function( buffer ){

            buffer.setVisibility( value );

        } );

        if( !noRenderRequest ) this.viewer.requestRender();

        return this;

    },

    setParameters: function( params, what, rebuild ){

        var p = params || {};
        var tp = this.parameters;

        what = what || {};
        rebuild = rebuild || false;

        var bufferParams = {};

        for( var name in p ){

            if( p[ name ] === undefined ) continue;
            if( tp[ name ] === undefined ) continue;

            if( tp[ name ].int ) p[ name ] = parseInt( p[ name ] );
            if( tp[ name ].float ) p[ name ] = parseFloat( p[ name ] );

            // no value change
            if( p[ name ] === this[ name ] ) continue;

            this[ name ] = p[ name ];

            // buffer param
            if( tp[ name ].buffer ){
                if( tp[ name ].buffer === true ){
                    bufferParams[ name ] = p[ name ];
                }else{
                    bufferParams[ tp[ name ].buffer ] = p[ name ];
                }
            }

            // mark for update
            if( tp[ name ].update ){
                what[ tp[ name ].update ] = true;
            }

            // mark for rebuild
            if( tp[ name ].rebuild &&
                !( tp[ name ].rebuild === "impostor" &&
                    NGL.extensionFragDepth && !this.disableImpostor )
            ){
                rebuild = true;
            }

        }

        //

        if( rebuild ){

            this.build();

        }else{

            this.bufferList.forEach( function( buffer ){
                buffer.setParameters( bufferParams );
            } );

            if( Object.keys( what ).length ){
                this.update( what );  // update buffer attribute
            }

            this.viewer.requestRender();

        }

        return this;

    },

    getParameters: function(){

        var params = {
            visible: this.visible,
            quality: this.quality
        };

        Object.keys( this.parameters ).forEach( function( name ){
            params[ name ] = this[ name ];
        }, this );

        return params;

    },

    clear: function(){

        this.bufferList.forEach( function( buffer ){

            this.viewer.remove( buffer );
            buffer.dispose();

        }, this );

        this.bufferList.length = 0;

        this.viewer.requestRender();

    },

    dispose: function(){

        this.disposed = true;
        this.queue.kill();
        this.tasks.dispose();
        this.clear();

    }

};


NGL.BufferRepresentation = function( buffer, viewer, params ){

    NGL.Representation.call( this, buffer, viewer, params );

    this.buffer = buffer;

    this.build();

};

NGL.BufferRepresentation.prototype = NGL.createObject(

    NGL.Representation.prototype, {

    constructor: NGL.BufferRepresentation,

    type: "buffer",

    parameters: Object.assign( {

    }, NGL.Representation.prototype.parameters, {

        colorScheme: null,
        colorScale: null,
        colorValue: null,
        colorDomain: null,
        colorMode: null

    } ),

    create: function(){

        this.bufferList.push( this.buffer );

    },

    attach: function( callback ){

        this.bufferList.forEach( function( buffer ){

            this.viewer.add( buffer );

        }, this );

        this.setVisibility( this.visible );

        callback();

    }

} );


/////////////////////////////
// Structure representation

NGL.StructureRepresentation = function( structure, viewer, params ){

    var p = params || {};

    this.dataList = [];

    this.structure = structure;
    this.selection = new NGL.Selection( p.sele );
    this.structureView = this.structure.getView( this.selection );

    NGL.Representation.call( this, structure, viewer, p );

    if( structure.biomolDict ){
        var biomolOptions = { "default": "default", "": "AU" };
        Object.keys( structure.biomolDict ).forEach( function( k ){
            biomolOptions[ k ] = k;
        } );
        this.parameters.assembly = {
            type: "select",
            options: biomolOptions,
            rebuild: true
        };
    }else{
        this.parameters.assembly = null;
    }

    // must come after structureView to ensure selection change signals
    // have already updated the structureView
    this.selection.signals.stringChanged.add( function(){
        this.build();
    }.bind( this ) );

    this.build();

};

NGL.StructureRepresentation.prototype = NGL.createObject(

    NGL.Representation.prototype, {

    constructor: NGL.StructureRepresentation,

    type: "structure",

    parameters: Object.assign( {

        radiusType: {
            type: "select", options: NGL.RadiusFactory.types
        },
        radius: {
            type: "number", precision: 3, max: 10.0, min: 0.001
        },
        scale: {
            type: "number", precision: 3, max: 10.0, min: 0.001
        },
        assembly: null

    }, NGL.Representation.prototype.parameters ),

    defaultScale: {
        "vdw": 1.0,
        "covalent": 1.0,
        "bfactor": 0.01,
        "sstruc": 1.0
    },

    defaultSize: 1.0,

    init: function( params ){

        var p = params || {};
        p.colorScheme = p.colorScheme || "element";

        this.radius = p.radius || "vdw";
        this.scale = p.scale || 1.0;
        this.assembly = p.assembly === undefined ? "default" : p.assembly;
        this.defaultAssembly = p.defaultAssembly || "";

        NGL.Representation.prototype.init.call( this, p );

    },

    create: function(){

        if( this.structureView.atomCount === 0 ) return;

        var name = this.assembly === "default" ? this.defaultAssembly : this.assembly;
        var assembly = this.structure.biomolDict[ name ];

        if( assembly ){
            assembly.partList.forEach( function( part, i ){
                var sview = part.getView( this.structureView );
                if( sview.atomCount === 0 ) return;
                var data = this.createData( sview, i );
                if( data ){
                    data.sview = sview;
                    data.instanceList = part.getInstanceList();
                    this.dataList.push( data );
                }
            }, this );
        }else{
            var data = this.createData( this.structureView, 0 );
            if( data ){
                data.sview = this.structureView;
                this.dataList.push( data );
            }
        }

    },

    createData: function( sview ){

        console.error( "createData not implemented" );

    },

    update: function( what ){

        this.dataList.forEach( function( data ){
            if( data.bufferList.length > 0 ){
                this.updateData( what, data );
            }
        }, this );

    },

    updateData: function( what, data ){

        console.error( "updateData not implemented" );

    },

    getColorParams: function(){

        var p = NGL.Representation.prototype.getColorParams.call( this );
        p.structure = this.structure;

        return p;

    },

    getAtomParams: function( what, params ){

        return Object.assign( {
            what: what,
            colorParams: this.getColorParams(),
            radiusParams: { "radius": this.radius, "scale": this.scale }
        }, params );

    },

    getBondParams: function( what, params ){

        return Object.assign( {
            what: what,
            colorParams: this.getColorParams(),
            radiusParams: { "radius": this.radius, "scale": this.scale }
        }, params );

    },

    setSelection: function( string, silent ){

        this.selection.setString( string, silent );

        return this;

    },

    setParameters: function( params, what, rebuild ){

        what = what || {};

        if( params && params[ "radiusType" ] !== undefined ){
            if( params[ "radiusType" ] === "size" ){
                this.radius = this.defaultSize;
            }else{
                this.radius = params[ "radiusType" ];
            }
            what[ "radius" ] = true;
            if( !NGL.extensionFragDepth || this.disableImpostor ){
                rebuild = true;
            }
        }

        if( params && params[ "radius" ] !== undefined ){
            what[ "radius" ] = true;
            if( !NGL.extensionFragDepth || this.disableImpostor ){
                rebuild = true;
            }
        }

        if( params && params[ "scale" ] !== undefined ){
            what[ "radius" ] = true;
            if( !NGL.extensionFragDepth || this.disableImpostor ){
                rebuild = true;
            }
        }

        NGL.Representation.prototype.setParameters.call(
            this, params, what, rebuild
        );

        return this;

    },

    getParameters: function(){

        var params = Object.assign(
            NGL.Representation.prototype.getParameters.call( this ),
            {
                sele: this.selection ? this.selection.string : undefined,
                defaultAssembly: this.defaultAssembly
            }
        );

        return params;

    },

    attach: function( callback ){

        var viewer = this.viewer;
        var bufferList = this.bufferList;

        this.dataList.forEach( function( data ){
            data.bufferList.forEach( function( buffer ){
                bufferList.push( buffer );
                viewer.add( buffer, data.instanceList );
            } )
        } );

        this.setVisibility( this.visible );
        callback();

    },

    clear: function(){

        this.dataList.length = 0;

        NGL.Representation.prototype.clear.call( this );

    },

    dispose: function(){

        this.structureView.dispose();

        delete this.structure;
        delete this.structureView;

        NGL.Representation.prototype.dispose.call( this );

    }

} );


NGL.SpacefillRepresentation = function( structure, viewer, params ){

    NGL.StructureRepresentation.call( this, structure, viewer, params );

};

NGL.SpacefillRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.SpacefillRepresentation,

    type: "spacefill",

    parameters: Object.assign( {

        sphereDetail: {
            type: "integer", max: 3, min: 0, rebuild: "impostor"
        },
        disableImpostor: {
            type: "boolean", rebuild: true
        }

    }, NGL.StructureRepresentation.prototype.parameters ),

    init: function( params ){

        var p = params || {};

        if( p.quality === "low" ){
            this.sphereDetail = 0;
        }else if( p.quality === "medium" ){
            this.sphereDetail = 1;
        }else if( p.quality === "high" ){
            this.sphereDetail = 2;
        }else{
            this.sphereDetail = p.sphereDetail !== undefined ? p.sphereDetail : 1;
        }
        this.disableImpostor = p.disableImpostor || false;

        NGL.StructureRepresentation.prototype.init.call( this, p );

    },

    createData: function( sview ){

        var atomData = sview.getAtomData( this.getAtomParams() );

        var sphereBuffer = new NGL.SphereBuffer(
            atomData.position,
            atomData.color,
            atomData.radius,
            atomData.pickingColor,
            this.getBufferParams( {
                sphereDetail: this.sphereDetail,
                dullInterior: true,
                disableImpostor: this.disableImpostor
            } )
        );

        return {
            bufferList: [ sphereBuffer ]
        };

    },

    updateData: function( what, data ){

        var atomData = data.sview.getAtomData( this.getAtomParams( what ) );
        var sphereData = {};

        if( !what || what[ "position" ] ){
            sphereData[ "position" ] = atomData.position;
        }

        if( !what || what[ "color" ] ){
            sphereData[ "color" ] = atomData.color;
        }

        if( !what || what[ "radius" ] ){
            sphereData[ "radius" ] = atomData.radius;
        }

        data.bufferList[ 0 ].setAttributes( sphereData );

    }

} );


NGL.PointRepresentation = function( structure, viewer, params ){

    NGL.StructureRepresentation.call( this, structure, viewer, params );

};

NGL.PointRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.PointRepresentation,

    type: "point",

    parameters: Object.assign( {

        pointSize: {
            type: "number", precision: 1, max: 100, min: 0, buffer: true
        },
        sizeAttenuation: {
            type: "boolean", buffer: true
        },
        sortParticles: {
            type: "boolean", rebuild: true
        },
        useTexture: {
            type: "boolean", buffer: true
        },
        alphaTest: {
            type: "range", step: 0.001, max: 1, min: 0, buffer: true
        },
        forceTransparent: {
            type: "boolean", buffer: true
        },
        edgeBleach: {
            type: "range", step: 0.001, max: 1, min: 0, buffer: true
        },

    }, NGL.Representation.prototype.parameters, {

        flatShaded: null,
        wireframe: null,
        linewidth: null,

        roughness: null,
        metalness: null

    } ),

    init: function( params ){

        var p = params || {};

        this.pointSize = p.pointSize || 1;
        this.sizeAttenuation = p.sizeAttenuation !== undefined ? p.sizeAttenuation : true;
        this.sortParticles = p.sortParticles !== undefined ? p.sortParticles : false;
        this.useTexture = p.useTexture !== undefined ? p.useTexture : false;
        this.alphaTest = p.alphaTest !== undefined ? p.alphaTest : 0.5;
        this.forceTransparent = p.forceTransparent !== undefined ? p.forceTransparent : false;
        this.edgeBleach = p.edgeBleach !== undefined ? p.edgeBleach : 0.0;

        NGL.StructureRepresentation.prototype.init.call( this, p );

    },

    createData: function( sview ){

        var what = { position: true, color: true };
        var atomData = sview.getAtomData( this.getAtomParams( what ) );

        var pointBuffer = new NGL.PointBuffer(
            atomData.position,
            atomData.color,
            this.getBufferParams( {
                pointSize: this.pointSize,
                sizeAttenuation: this.sizeAttenuation,
                sortParticles: this.sortParticles,
                useTexture: this.useTexture,
                alphaTest: this.alphaTest,
                forceTransparent: this.forceTransparent,
                edgeBleach: this.edgeBleach
            } )
        );

        return {
            bufferList: [ pointBuffer ]
        };

    },

    updateData: function( what, data ){

        var atomData = data.sview.getAtomData( this.getAtomParams( what ) );
        var pointData = {};

        if( !what || what[ "position" ] ){
            pointData[ "position" ] = atomData.position;
        }

        if( !what || what[ "color" ] ){
            pointData[ "color" ] = atomData.color;
        }

        data.bufferList[ 0 ].setAttributes( pointData );

    }

} );


NGL.LabelRepresentation = function( structure, viewer, params ){

    NGL.StructureRepresentation.call( this, structure, viewer, params );

};

NGL.LabelRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.LabelRepresentation,

    type: "label",

    parameters: Object.assign( {

        labelType: {
            type: "select", options: NGL.LabelFactory.types, rebuild: true
        },
        fontFamily: {
            type: "select", options: {
                "sans-serif": "sans-serif",
                "monospace": "monospace",
                "serif": "serif"
            },
            buffer: true
        },
        fontStyle: {
            type: "select", options: {
                "normal": "normal",
                "italic": "italic"
            },
            buffer: true
        },
        fontWeight: {
            type: "select", options: {
                "normal": "normal",
                "bold": "bold"
            },
            buffer: true
        },
        sdf: {
            type: "boolean", buffer: true
        },

    }, NGL.StructureRepresentation.prototype.parameters, {

        side: null,
        flatShaded: null,
        wireframe: null,
        linewidth: null,

        roughness: null,
        metalness: null,
        diffuse: null,

    } ),

    init: function( params ){

        var p = params || {};

        this.labelType = p.labelType || "res";
        this.labelText = p.labelText || {};
        this.fontFamily = p.fontFamily || "sans-serif";
        this.fontStyle = p.fontStyle || "normal";
        this.fontWeight = p.fontWeight || "bold";
        this.sdf = p.sdf !== undefined ? p.sdf : NGL.browser !== "Firefox";  // FIXME

        NGL.StructureRepresentation.prototype.init.call( this, p );

    },

    createData: function( sview ){

        var what = { position: true, color: true, radius: true };
        var atomData = sview.getAtomData( this.getAtomParams( what ) );

        var text = [];
        var labelFactory = new NGL.LabelFactory(
            this.labelType, this.labelText
        );
        sview.eachAtom( function( ap ){
            text.push( labelFactory.atomLabel( ap ) );
        } );

        var textBuffer = new NGL.TextBuffer(
            atomData.position,
            atomData.radius,
            atomData.color,
            text,
            this.getBufferParams( {
                fontFamily: this.fontFamily,
                fontStyle: this.fontStyle,
                fontWeight: this.fontWeight,
                sdf: this.sdf
            } )
        );

        return {
            bufferList: [ textBuffer ]
        };

    },

    updateData: function( what, data ){

        var atomData = data.sview.getAtomData( this.getAtomParams( what ) );
        var textData = {};

        if( !what || what[ "position" ] ){
            textData[ "position" ] = atomData.position;
        }

        if( !what || what[ "radius" ] ){
            textData[ "size" ] = atomData.radius;
        }

        if( !what || what[ "color" ] ){
            textData[ "color" ] = atomData.color;
        }

        data.bufferList[ 0 ].setAttributes( textData );

    }

} );


NGL.BallAndStickRepresentation = function( structure, viewer, params ){

    NGL.StructureRepresentation.call( this, structure, viewer, params );

};

NGL.BallAndStickRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.BallAndStickRepresentation,

    type: "ball+stick",

    defaultSize: 0.15,

    parameters: Object.assign( {

        sphereDetail: {
            type: "integer", max: 3, min: 0, rebuild: "impostor"
        },
        radiusSegments: {
            type: "integer", max: 25, min: 5, rebuild: "impostor"
        },
        disableImpostor: {
            type: "boolean", rebuild: true
        },
        aspectRatio: {
            type: "number", precision: 1, max: 10.0, min: 1.0
        },
        lineOnly: {
            type: "boolean", rebuild: true
        },
        cylinderOnly: {
            type: "boolean", rebuild: true
        }

    }, NGL.StructureRepresentation.prototype.parameters ),

    init: function( params ){

        var p = params || {};
        p.radius = p.radius || this.defaultSize;

        if( p.quality === "low" ){
            this.sphereDetail = 0;
            this.radiusSegments = 5;
        }else if( p.quality === "medium" ){
            this.sphereDetail = 1;
            this.radiusSegments = 10;
        }else if( p.quality === "high" ){
            this.sphereDetail = 2;
            this.radiusSegments = 20;
        }else{
            this.sphereDetail = p.sphereDetail !== undefined ? p.sphereDetail : 1;
            this.radiusSegments = p.radiusSegments !== undefined ? p.radiusSegments : 10;
        }
        this.disableImpostor = p.disableImpostor || false;

        this.aspectRatio = p.aspectRatio || 2.0;
        this.lineOnly = p.lineOnly || false;
        this.cylinderOnly = p.cylinderOnly || false;

        NGL.StructureRepresentation.prototype.init.call( this, p );

    },

    getAtomParams: function( what, params ){

        params = Object.assign( {
            radiusParams: { "radius": this.radius, "scale": this.scale * this.aspectRatio }
        }, params );

        return NGL.StructureRepresentation.prototype.getAtomParams.call( this, what, params );

    },

    getAtomData: function( sview, what, params ){

        return sview.getAtomData( this.getAtomParams( what, params ) );

    },

    getBondData: function( sview, what, params ){

        return sview.getBondData( this.getBondParams( what, params ) );

    },

    createData: function( sview ){

        var bufferList = [];

        if( this.lineOnly ){

            var bondData = this.getBondData( sview );

            this.lineBuffer = new NGL.LineBuffer(
                bondData.position1,
                bondData.position2,
                bondData.color1,
                bondData.color2,
                this.getBufferParams()
            );

            bufferList.push( this.lineBuffer );

        }else{

            if( !this.cylinderOnly ){

                var atomData = this.getAtomData( sview );

                var sphereBuffer = new NGL.SphereBuffer(
                    atomData.position,
                    atomData.color,
                    atomData.radius,
                    atomData.pickingColor,
                    this.getBufferParams( {
                        sphereDetail: this.sphereDetail,
                        disableImpostor: this.disableImpostor,
                        dullInterior: true
                    } )
                );

                bufferList.push( sphereBuffer );

            }

            var bondData = this.getBondData( sview );

            var cylinderBuffer = new NGL.CylinderBuffer(
                bondData.position1,
                bondData.position2,
                bondData.color1,
                bondData.color2,
                bondData.radius,
                bondData.pickingColor1,
                bondData.pickingColor2,
                this.getBufferParams( {
                    shift: 0,
                    cap: true,
                    radiusSegments: this.radiusSegments,
                    disableImpostor: this.disableImpostor,
                    dullInterior: true
                } )
            );

            bufferList.push( cylinderBuffer );

        }

        return {
            bufferList: bufferList
        };

    },

    updateData: function( what, data ){

        if( this.lineOnly ){

            var bondData = this.getBondData( data.sview, what );
            var lineData = {};

            if( !what || what[ "position" ] ){
                lineData[ "from" ] = bondData.position1;
                lineData[ "to" ] = bondData.position2;
            }

            if( !what || what[ "color" ] ){
                lineData[ "color" ] = bondData.color1;
                lineData[ "color2" ] = bondData.color2;
            }

            data.bufferList[ 0 ].setAttributes( lineData );

        }else{

            var atomData = this.getAtomData( data.sview, what );
            var bondData = this.getBondData( data.sview, what );
            var sphereData = {};
            var cylinderData = {};

            if( !what || what[ "position" ] ){
                sphereData[ "position" ] = atomData.position;
                cylinderData[ "position" ] = NGL.Utils.calculateCenterArray(
                    bondData.position1, bondData.position2
                );
                cylinderData[ "position1" ] = bondData.position1;
                cylinderData[ "position2" ] = bondData.position2;
            }

            if( !what || what[ "color" ] ){
                sphereData[ "color" ] = atomData.color;
                cylinderData[ "color" ] = bondData.color1;
                cylinderData[ "color2" ] = bondData.color2;
            }

            if( !what || what[ "radius" ] ){
                sphereData[ "radius" ] = atomData.radius;
                cylinderData[ "radius" ] = bondData.radius;
            }

            data.bufferList[ 0 ].setAttributes( sphereData );
            data.bufferList[ 1 ].setAttributes( cylinderData );

        }

    },

    setParameters: function( params ){

        var rebuild = false;
        var what = {};

        if( params && params[ "aspectRatio" ] ){

            what[ "radius" ] = true;
            if( !NGL.extensionFragDepth || this.disableImpostor ){
                rebuild = true;
            }

        }

        NGL.StructureRepresentation.prototype.setParameters.call(
            this, params, what, rebuild
        );

        return this;

    }

} );


NGL.LicoriceRepresentation = function( structure, viewer, params ){

    NGL.BallAndStickRepresentation.call( this, structure, viewer, params );

};

NGL.LicoriceRepresentation.prototype = NGL.createObject(

    NGL.BallAndStickRepresentation.prototype, {

    constructor: NGL.LicoriceRepresentation,

    type: "licorice",

    parameters: Object.assign(
        {}, NGL.BallAndStickRepresentation.prototype.parameters, { aspectRatio: null }
    ),

    init: function( params ){

        var p = params || {};
        p.aspectRatio = 1.0;

        NGL.BallAndStickRepresentation.prototype.init.call( this, p );

    }

} );


NGL.LineRepresentation = function( structure, viewer, params ){

    NGL.StructureRepresentation.call( this, structure, viewer, params );

};

NGL.LineRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.LineRepresentation,

    type: "line",

    parameters: Object.assign( {

    }, NGL.Representation.prototype.parameters, {

        flatShaded: null,
        side: null,
        wireframe: null,

        roughness: null,
        metalness: null,
        diffuse: null,

    } ),

    init: function( params ){

        var p = params || {};

        NGL.StructureRepresentation.prototype.init.call( this, p );

    },

    createData: function( sview ){

        var what = { position: true, color: true };
        var bondData = sview.getBondData( this.getBondParams( what ) );

        var lineBuffer = new NGL.LineBuffer(
            bondData.position1,
            bondData.position2,
            bondData.color1,
            bondData.color2,
            this.getBufferParams()
        );

        return {
            bufferList: [ lineBuffer ]
        };

    },

    updateData: function( what, data ){

        var bondData = data.sview.getBondData( this.getBondParams( what ) );
        var lineData = {};

        if( !what || what[ "position" ] ){
            lineData[ "from" ] = bondData.position1;
            lineData[ "to" ] = bondData.position2;
        }

        if( !what || what[ "color" ] ){
            lineData[ "color" ] = bondData.color1;
            lineData[ "color2" ] = bondData.color2;
        }

        data.bufferList[ 0 ].setAttributes( lineData );

    }

} );


NGL.HyperballRepresentation = function( structure, viewer, params ){

    NGL.LicoriceRepresentation.call( this, structure, viewer, params );

    this.defaultScale[ "vdw" ] = 0.2;

};

NGL.HyperballRepresentation.prototype = NGL.createObject(

    NGL.LicoriceRepresentation.prototype, {

    constructor: NGL.HyperballRepresentation,

    type: "hyperball",

    defaultSize: 1.0,

    parameters: Object.assign( {

        shrink: {
            type: "number", precision: 3, max: 1.0, min: 0.001, buffer: true
        }

    }, NGL.LicoriceRepresentation.prototype.parameters ),

    init: function( params ){

        var p = params || {};
        p.scale = p.scale || 0.2;
        p.radius = p.radius || "vdw";

        this.shrink = p.shrink || 0.12;

        NGL.LicoriceRepresentation.prototype.init.call( this, p );

    },

    getBondParams: function( what, params ){

        if( !what || what[ "radius" ] ){
            params = Object.assign( { radius2: true }, params );
        }

        return NGL.LicoriceRepresentation.prototype.getBondParams.call( this, what, params );

    },

    createData: function( sview ){

        var atomData = sview.getAtomData( this.getAtomParams() );
        var bondData = sview.getBondData( this.getBondParams() );

        var sphereBuffer = new NGL.SphereBuffer(
            atomData.position,
            atomData.color,
            atomData.radius,
            atomData.pickingColor,
            this.getBufferParams( {
                sphereDetail: this.sphereDetail,
                disableImpostor: this.disableImpostor,
                dullInterior: true
            } )
        );

        this.__center = new Float32Array( sview.bondCount * 3 );

        var stickBuffer = new NGL.HyperballStickBuffer(
            bondData.position1,
            bondData.position2,
            bondData.color1,
            bondData.color2,
            bondData.radius1,
            bondData.radius2,
            bondData.pickingColor1,
            bondData.pickingColor2,
            this.getBufferParams( {
                shrink: this.shrink,
                radiusSegments: this.radiusSegments,
                dullInterior: true
            } ),
            this.disableImpostor
        );

        return {
            bufferList: [ sphereBuffer, stickBuffer ]
        };

    },

    updateData: function( what, data ){

        var atomData = data.sview.getAtomData( this.getAtomParams() );
        var bondData = data.sview.getBondData( this.getBondParams() );
        var sphereData = {};
        var stickData = {};

        if( !what || what[ "position" ] ){
            sphereData[ "position" ] = atomData.position;
            var from = bondData.position1;
            var to = bondData.position2;
            stickData[ "position" ] = NGL.Utils.calculateCenterArray(
                from, to, this.__center
            );
            stickData[ "position1" ] = from;
            stickData[ "position2" ] = to;
        }

        if( !what || what[ "color" ] ){
            sphereData[ "color" ] = atomData.color;
            stickData[ "color" ] = bondData.color1;
            stickData[ "color2" ] = bondData.color2;
        }

        if( !what || what[ "radius" ] ){
            sphereData[ "radius" ] = atomData.radius;
            stickData[ "radius" ] = bondData.radius1;
            stickData[ "radius2" ] = bondData.radius2;
        }

        data.bufferList[ 0 ].setAttributes( sphereData );
        data.bufferList[ 1 ].setAttributes( stickData );

    },

} );


NGL.BackboneRepresentation = function( structure, viewer, params ){

    NGL.BallAndStickRepresentation.call( this, structure, viewer, params );

};

NGL.BackboneRepresentation.prototype = NGL.createObject(

    NGL.BallAndStickRepresentation.prototype, {

    constructor: NGL.BackboneRepresentation,

    type: "backbone",

    defaultSize: 0.25,

    parameters: Object.assign( {

    }, NGL.BallAndStickRepresentation.prototype.parameters ),

    init: function( params ){

        var p = params || {};
        p.aspectRatio = p.aspectRatio || 1.0;

        NGL.BallAndStickRepresentation.prototype.init.call( this, p );

    },

    getAtomData: function( sview, what, params ){

        return sview.getBackboneAtomData( this.getAtomParams( what, params ) );

    },

    getBondData: function( sview, what, params ){

        var p = this.getBondParams( what, params );
        p.colorParams.backbone = true;

        return sview.getBackboneBondData( p );

    }

} );


NGL.BaseRepresentation = function( structure, viewer, params ){

    NGL.StructureRepresentation.call( this, structure, viewer, params );

};

NGL.BaseRepresentation.prototype = NGL.createObject(

    NGL.BallAndStickRepresentation.prototype, {

    constructor: NGL.BaseRepresentation,

    type: "base",

    defaultSize: 0.3,

    parameters: Object.assign( {

    }, NGL.BallAndStickRepresentation.prototype.parameters ),

    init: function( params ){

        var p = params || {};
        p.aspectRatio = p.aspectRatio || 1.0;

        NGL.BallAndStickRepresentation.prototype.init.call( this, p );

    },

    getAtomData: function( sview, what, params ){

        return sview.getRungAtomData( this.getAtomParams( what, params ) );

    },

    getBondData: function( sview, what, params ){

        var p = this.getBondParams( what, params );
        p.colorParams.rung = true;

        return sview.getRungBondData( p );

    }

} );


NGL.CartoonRepresentation = function( structure, viewer, params ){

    NGL.StructureRepresentation.call( this, structure, viewer, params );

};

NGL.CartoonRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.CartoonRepresentation,

    type: "cartoon",

    parameters: Object.assign( {

        aspectRatio: {
            type: "number", precision: 1, max: 10.0, min: 1.0
        },
        subdiv: {
            type: "integer", max: 50, min: 1, rebuild: true
        },
        radialSegments: {
            type: "integer", max: 50, min: 1, rebuild: true
        },
        tension: {
            type: "number", precision: 1, max: 1.0, min: 0.1
        },
        capped: {
            type: "boolean", rebuild: true
        },
        smoothSheet: {
            type: "boolean", rebuild: true
        }

    }, NGL.StructureRepresentation.prototype.parameters ),

    init: function( params ){

        var p = params || {};
        p.colorScheme = p.colorScheme || "atomindex";
        p.colorScale = p.colorScale || "RdYlBu";
        p.radius = p.radius || "sstruc";
        p.scale = p.scale || 0.7;

        if( p.quality === "low" ){
            this.subdiv = 3;
            this.radialSegments = 6;
        }else if( p.quality === "medium" ){
            this.subdiv = 6;
            this.radialSegments = 10;
        }else if( p.quality === "high" ){
            this.subdiv = 12;
            this.radialSegments = 20;
        }else{
            this.subdiv = p.subdiv || 6;
            this.radialSegments = p.radialSegments || 10;
        }

        this.aspectRatio = p.aspectRatio || 5.0;
        this.tension = p.tension || NaN;
        this.capped = p.capped === undefined ? true : p.capped;
        this.smoothSheet = p.smoothSheet || false;

        NGL.StructureRepresentation.prototype.init.call( this, p );

    },

    getSplineParams: function( params ){

        return Object.assign( {
            subdiv: this.subdiv,
            tension: this.tension,
            directional: this.aspectRatio === 1.0 ? false : true,
            smoothSheet: this.smoothSheet
        }, params );

    },

    getSpline: function( polymer ){

        return new NGL.Spline( polymer, this.getSplineParams() );

    },

    getScale: function( polymer ){

        return polymer.isCg() ? this.scale * this.aspectRatio : this.scale;

    },

    getAspectRatio: function( polymer ){

        return polymer.isCg() ? 1.0 : this.aspectRatio;

    },

    createData: function( sview ){

        var bufferList = [];
        var polymerList = [];

        this.structure.eachPolymer( function( polymer ){

            if( polymer.residueCount < 4 ) return;
            polymerList.push( polymer );

            var spline = this.getSpline( polymer );

            var subPos = spline.getSubdividedPosition();
            var subOri = spline.getSubdividedOrientation();
            var subCol = spline.getSubdividedColor( this.getColorParams() );
            var subSize = spline.getSubdividedSize( this.radius, this.getScale( polymer ) );

            bufferList.push(
                new NGL.TubeMeshBuffer(
                    subPos.position,
                    subOri.normal,
                    subOri.binormal,
                    subOri.tangent,
                    subCol.color,
                    subSize.size,
                    subCol.pickingColor,
                    this.getBufferParams( {
                        radialSegments: this.radialSegments,
                        aspectRatio: this.getAspectRatio( polymer ),
                        capped: this.capped,
                        dullInterior: true
                    } )
                )
            );

        }.bind( this ), sview.getSelection() );

        return {
            bufferList: bufferList,
            polymerList: polymerList
        };

    },

    updateData: function( what, data ){

        if( NGL.debug ) NGL.time( this.type + " repr update" );

        what = what || {};

        for( var i = 0, il = data.polymerList.length; i < il; ++i ){

            var bufferData = {};
            var polymer = data.polymerList[ i ];
            var spline = this.getSpline( polymer );

            data.bufferList[ i ].aspectRatio = this.getAspectRatio( polymer );

            if( what[ "position" ] || what[ "radius" ] ){

                var subPos = spline.getSubdividedPosition();
                var subOri = spline.getSubdividedOrientation();
                var subSize = spline.getSubdividedSize( this.radius, this.getScale( polymer ) );

                bufferData[ "position" ] = subPos.position;
                bufferData[ "normal" ] = subOri.normal;
                bufferData[ "binormal" ] = subOri.binormal;
                bufferData[ "tangent" ] = subOri.tangent;
                bufferData[ "size" ] = subSize.size;

            }

            if( what[ "color" ] ){

                var subCol = spline.getSubdividedColor( this.getColorParams() );

                bufferData[ "color" ] = subCol.color;
                bufferData[ "pickingColor" ] = subCol.pickingColor;

            }

            data.bufferList[ i ].setAttributes( bufferData );

        }

        if( NGL.debug ) NGL.timeEnd( this.type + " repr update" );

    },

    setParameters: function( params ){

        var rebuild = false;
        var what = {};

        if( params && params[ "aspectRatio" ] ){
            what[ "radius" ] = true;
        }

        if( params && params[ "tension" ] ){
            what[ "position" ] = true;
        }

        NGL.StructureRepresentation.prototype.setParameters.call(
            this, params, what, rebuild
        );

        return this;

    }

} );


NGL.TubeRepresentation = function( structure, viewer, params ){

    NGL.CartoonRepresentation.call( this, structure, viewer, params );

};

NGL.TubeRepresentation.prototype = NGL.createObject(

    NGL.CartoonRepresentation.prototype, {

    constructor: NGL.TubeRepresentation,

    type: "tube",

    parameters: Object.assign(
        {}, NGL.CartoonRepresentation.prototype.parameters, { aspectRatio: null }
    ),

    init: function( params ){

        var p = params || {};
        p.aspectRatio = 1.0;
        p.scale = p.scale || 2.0;

        NGL.CartoonRepresentation.prototype.init.call( this, p );

    },

    getSplineParams: function( params ){

        return NGL.CartoonRepresentation.prototype.getSplineParams.call( this, {
            directional: false
        } );

    }

} );


NGL.RibbonRepresentation = function( structure, viewer, params ){

    NGL.StructureRepresentation.call( this, structure, viewer, params );

    this.defaultScale[ "sstruc" ] *= 3.0;

};

NGL.RibbonRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.RibbonRepresentation,

    type: "ribbon",

    parameters: Object.assign( {

        subdiv: {
            type: "integer", max: 50, min: 1, rebuild: true
        },
        tension: {
            type: "number", precision: 1, max: 1.0, min: 0.1
        },
        smoothSheet: {
            type: "boolean", rebuild: true
        }

    }, NGL.StructureRepresentation.prototype.parameters, {

        side: null,
        wireframe: null,
        linewidth: null

    } ),

    init: function( params ){

        var p = params || {};
        p.colorScheme = p.colorScheme || "atomindex";
        p.colorScale = p.colorScale || "RdYlBu";
        p.radius = p.radius || "sstruc";
        p.scale = p.scale || 4.0;

        if( p.quality === "low" ){
            this.subdiv = 3;
        }else if( p.quality === "medium" ){
            this.subdiv = 6;
        }else if( p.quality === "high" ){
            this.subdiv = 12;
        }else{
            this.subdiv = p.subdiv || 6;
        }

        this.tension = p.tension || NaN;
        this.smoothSheet = p.smoothSheet || false;

        NGL.StructureRepresentation.prototype.init.call( this, p );

    },

    getSplineParams: function( params ){

        return Object.assign( {
            subdiv: this.subdiv,
            tension: this.tension,
            directional: true,
            smoothSheet: this.smoothSheet
        }, params );

    },

    createData: function( sview ){

        var bufferList = [];
        var polymerList = [];

        this.structure.eachPolymer( function( polymer ){

            if( polymer.residueCount < 4 ) return;
            polymerList.push( polymer );

            var spline = new NGL.Spline( polymer, this.getSplineParams() );
            var subPos = spline.getSubdividedPosition();
            var subOri = spline.getSubdividedOrientation();
            var subCol = spline.getSubdividedColor( this.getColorParams() );
            var subSize = spline.getSubdividedSize( this.radius, this.scale );

            bufferList.push(
                new NGL.RibbonBuffer(
                    subPos.position,
                    subOri.binormal,
                    subOri.normal,
                    subCol.color,
                    subSize.size,
                    subCol.pickingColor,
                    this.getBufferParams()
                )
            );

        }.bind( this ), sview.getSelection() );

        return {
            bufferList: bufferList,
            polymerList: polymerList
        };

    },

    updateData: function( what, data ){

        what = what || {};

        var i = 0;
        var n = data.polymerList.length;

        for( i = 0; i < n; ++i ){

            var bufferData = {};
            var spline = new NGL.Spline( data.polymerList[ i ], this.getSplineParams() );

            if( what[ "position" ] ){
                var subPos = spline.getSubdividedPosition();
                var subOri = spline.getSubdividedOrientation();
                bufferData[ "position" ] = subPos.position;
                bufferData[ "normal" ] = subOri.binormal;
                bufferData[ "dir" ] = subOri.normal;
            }

            if( what[ "radius" ] || what[ "scale" ] ){
                var subSize = spline.getSubdividedSize( this.radius, this.scale );
                bufferData[ "size" ] = subSize.size;
            }

            if( what[ "color" ] ){
                var subCol = spline.getSubdividedColor( this.getColorParams() );
                bufferData[ "color" ] = subCol.color;
            }

            data.bufferList[ i ].setAttributes( bufferData );

        };

    },

    setParameters: function( params ){

        var rebuild = false;
        var what = {};

        if( params && params[ "tension" ] ){
            what[ "position" ] = true;
        }

        NGL.StructureRepresentation.prototype.setParameters.call(
            this, params, what, rebuild
        );

        return this;

    }

} );


NGL.TraceRepresentation = function( structure, viewer, params ){

    NGL.StructureRepresentation.call( this, structure, viewer, params );

};

NGL.TraceRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.TraceRepresentation,

    type: "trace",

    parameters: Object.assign( {

        subdiv: {
            type: "integer", max: 50, min: 1, rebuild: true
        },
        tension: {
            type: "number", precision: 1, max: 1.0, min: 0.1
        },
        smoothSheet: {
            type: "boolean", rebuild: true
        }

    }, NGL.Representation.prototype.parameters, {

        flatShaded: null,
        side: null,
        wireframe: null

    } ),

    init: function( params ){

        var p = params || {};
        p.colorScheme = p.colorScheme || "atomindex";
        p.colorScale = p.colorScale || "RdYlBu";

        if( p.quality === "low" ){
            this.subdiv = 3;
        }else if( p.quality === "medium" ){
            this.subdiv = 6;
        }else if( p.quality === "high" ){
            this.subdiv = 12;
        }else{
            this.subdiv = p.subdiv || 6;
        }

        this.tension = p.tension || NaN;
        this.smoothSheet = p.smoothSheet || false;

        NGL.StructureRepresentation.prototype.init.call( this, p );

    },

    getSplineParams: function( params ){

        return Object.assign( {
            subdiv: this.subdiv,
            tension: this.tension,
            directional: false,
            smoothSheet: this.smoothSheet
        }, params );

    },

    createData: function( sview ){

        var bufferList = [];
        var polymerList = [];

        this.structure.eachPolymer( function( polymer ){

            if( polymer.residueCount < 4 ) return;
            polymerList.push( polymer );

            var spline = new NGL.Spline( polymer, this.getSplineParams() );
            var subPos = spline.getSubdividedPosition();
            var subCol = spline.getSubdividedColor( this.getColorParams() );

            bufferList.push(
                new NGL.TraceBuffer(
                    subPos.position,
                    subCol.color,
                    this.getBufferParams()
                )
            );

        }.bind( this ), sview.getSelection() );

        return {
            bufferList: bufferList,
            polymerList: polymerList
        };

    },

    updateData: function( what, data ){

        what = what || {};

        var i = 0;
        var n = data.polymerList.length;

        for( i = 0; i < n; ++i ){

            var bufferData = {};
            var spline = new NGL.Spline( data.polymerList[ i ], this.getSplineParams() );

            if( what[ "position" ] ){
                var subPos = spline.getSubdividedPosition();
                bufferData[ "position" ] = subPos.position;
            }

            if( what[ "color" ] ){
                var subCol = spline.getSubdividedColor( this.getColorParams() );
                bufferData[ "color" ] = subCol.color;
            }

            data.bufferList[ i ].setAttributes( bufferData );

        };

    },

    setParameters: function( params ){

        var rebuild = false;
        var what = {};

        if( params && params[ "tension" ] ){
            what[ "position" ] = true;
        }

        NGL.StructureRepresentation.prototype.setParameters.call(
            this, params, what, rebuild
        );

        return this;

    }

} );


NGL.HelixorientRepresentation = function( structure, viewer, params ){

    NGL.StructureRepresentation.call( this, structure, viewer, params );

};

NGL.HelixorientRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.HelixorientRepresentation,

    type: "helixorient",

    parameters: Object.assign( {

        sphereDetail: {
            type: "integer", max: 3, min: 0, rebuild: "impostor"
        },
        disableImpostor: {
            type: "boolean", rebuild: true
        }

    }, NGL.StructureRepresentation.prototype.parameters ),

    init: function( params ){

        var p = params || {};
        p.colorScheme = p.colorScheme || "sstruc";
        p.radius = p.radius || 0.15;
        p.scale = p.scale || 1.0;

        if( p.quality === "low" ){
            this.sphereDetail = 0;
        }else if( p.quality === "medium" ){
            this.sphereDetail = 1;
        }else if( p.quality === "high" ){
            this.sphereDetail = 2;
        }else{
            this.sphereDetail = p.sphereDetail !== undefined ? p.sphereDetail : 1;
        }
        this.disableImpostor = p.disableImpostor || false;

        NGL.StructureRepresentation.prototype.init.call( this, p );

    },

    createData: function( sview ){

        var bufferList = [];
        var polymerList = [];

        this.structure.eachPolymer( function( polymer ){

            if( polymer.residueCount < 4 ) return;
            polymerList.push( polymer );

            var helixorient = new NGL.Helixorient( polymer );
            var position = helixorient.getPosition();
            var color = helixorient.getColor( this.getColorParams() );
            var size = helixorient.getSize( this.radius, this.scale );

            bufferList.push(

                new NGL.SphereBuffer(
                    position.center,
                    color.color,
                    size.size,
                    color.pickingColor,
                    this.getBufferParams( {
                        sphereDetail: this.sphereDetail,
                        disableImpostor: this.disableImpostor,
                        dullInterior: true
                    } )
                ),

                new NGL.VectorBuffer(
                    position.center,
                    position.axis,
                    this.getBufferParams({
                        color: "skyblue",
                        scale: 1
                    })
                ),

                new NGL.VectorBuffer(
                    position.center,
                    position.resdir,
                    this.getBufferParams({
                        color: "lightgreen",
                        scale: 1
                    })
                )

            );


        }.bind( this ), sview.getSelection() );

        return {
            bufferList: bufferList,
            polymerList: polymerList
        };

    },

    updateData: function( what, data ){

        if( NGL.debug ) NGL.time( this.type + " repr update" );

        what = what || {};

        for( var i = 0, il = data.polymerList.length; i < il; ++i ){

            var j = i * 3;

            var bufferData = {};
            var polymer = data.polymerList[ i ]
            var helixorient = new NGL.Helixorient( polymer );

            if( what[ "position" ] ){

                var position = helixorient.getPosition();

                bufferData[ "position" ] = position.center;

                data.bufferList[ j + 1 ].setAttributes( {
                    "position": position.center,
                    "vector": position.axis,
                } );
                data.bufferList[ j + 2 ].setAttributes( {
                    "position": position.center,
                    "vector": position.resdir,
                } );

            }

            data.bufferList[ j ].setAttributes( bufferData );

        }

        if( NGL.debug ) NGL.timeEnd( this.type + " repr update" );

    }

} );


NGL.RocketRepresentation = function( structure, viewer, params ){

    this.helixbundleList = [];

    NGL.StructureRepresentation.call( this, structure, viewer, params );

};

NGL.RocketRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.RocketRepresentation,

    type: "rocket",

    parameters: Object.assign( {

        localAngle: {
            type: "integer", max: 180, min: 0, rebuild: true
        },
        centerDist: {
            type: "number", precision: 1, max: 10, min: 0, rebuild: true
        },
        ssBorder: {
            type: "boolean", rebuild: true
        },
        radiusSegments: {
            type: "integer", max: 25, min: 5, rebuild: "impostor"
        },
        disableImpostor: {
            type: "boolean", rebuild: true
        }

    }, NGL.StructureRepresentation.prototype.parameters ),

    init: function( params ){

        var p = params || {};
        p.colorScheme = p.colorScheme || "sstruc";
        p.radius = p.radius || 1.5;
        p.scale = p.scale || 1.0;

        if( p.quality === "low" ){
            this.radiusSegments = 5;
        }else if( p.quality === "medium" ){
            this.radiusSegments = 10;
        }else if( p.quality === "high" ){
            this.radiusSegments = 20;
        }else{
            this.radiusSegments = p.radiusSegments !== undefined ? p.radiusSegments : 10;
        }
        this.disableImpostor = p.disableImpostor || false;

        this.localAngle = p.localAngle || 30;
        this.centerDist = p.centerDist || 2.5;
        this.ssBorder = p.ssBorder === undefined ? false : p.ssBorder;

        NGL.StructureRepresentation.prototype.init.call( this, p );

    },

    createData: function( sview ){

        var length = 0;
        var axisList = [];
        var helixbundleList = [];

        this.structure.eachPolymer( function( polymer ){

            if( polymer.residueCount < 4 || polymer.isNucleic() ) return;

            var helixbundle = new NGL.Helixbundle( polymer );
            var axis = helixbundle.getAxis(
                this.localAngle, this.centerDist, this.ssBorder,
                this.getColorParams(), this.radius, this.scale
            );

            length += axis.size.length;
            axisList.push( axis );
            helixbundleList.push( helixbundle );

        }.bind( this ), sview.getSelection() );

        var axisData = {
            begin: new Float32Array( length * 3 ),
            end: new Float32Array( length * 3 ),
            size: new Float32Array( length ),
            color: new Float32Array( length * 3 ),
            pickingColor: new Float32Array( length * 3 ),
        };

        var offset = 0;

        axisList.forEach( function( axis ){
            axisData.begin.set( axis.begin, offset * 3 );
            axisData.end.set( axis.end, offset * 3 );
            axisData.size.set( axis.size, offset );
            axisData.color.set( axis.color, offset * 3 );
            axisData.pickingColor.set( axis.pickingColor, offset * 3 );
            offset += axis.size.length;
        } );

        var cylinderBuffer = new NGL.CylinderBuffer(
            axisData.begin,
            axisData.end,
            axisData.color,
            axisData.color,
            axisData.size,
            axisData.pickingColor,
            axisData.pickingColor,
            this.getBufferParams( {
                shift: 0,
                cap: true,
                radiusSegments: this.radiusSegments,
                disableImpostor: this.disableImpostor,
                dullInterior: true
            } )
        );

        return {
            bufferList: [ cylinderBuffer ],
            axisList: axisList,
            helixbundleList: helixbundleList,
            axisData: axisData
        };

    },

    updateData: function( what, data ){

        what = what || {};

        if( what[ "position" ] ){
            this.build();
            return;
        }

        var cylinderData = {};

        if( what[ "color" ] || what[ "radius" ] ){

            var offset = 0;

            data.helixbundleList.forEach( function( helixbundle ){

                var axis = helixbundle.getAxis(
                    this.localAngle, this.centerDist, this.ssBorder,
                    this.getColorParams(), this.radius, this.scale
                );
                if( what[ "color" ] ){
                    data.axisData.color.set( axis.color, offset * 3 );
                }
                if( what[ "radius" ] || what[ "scale" ] ){
                    data.axisData.size.set( axis.size, offset );
                }
                offset += axis.size.length;

            }.bind( this ) );

            if( what[ "color" ] ){
                cylinderData[ "color" ] = data.axisData.color;
                cylinderData[ "color2" ] = data.axisData.color;
            }

            if( what[ "radius" ] || what[ "scale" ] ){
                cylinderData[ "radius" ] = data.axisData.size;
            }

        }

        data.bufferList[ 0 ].setAttributes( cylinderData );

    }

} );


NGL.RopeRepresentation = function( structure, viewer, params ){

    NGL.CartoonRepresentation.call( this, structure, viewer, params );

};

NGL.RopeRepresentation.prototype = NGL.createObject(

    NGL.CartoonRepresentation.prototype, {

    constructor: NGL.RopeRepresentation,

    type: "rope",

    parameters: Object.assign( {

        smooth: {
            type: "integer", max: 15, min: 0, rebuild: true
        }

    }, NGL.CartoonRepresentation.prototype.parameters, {
        aspectRatio: null,
        smoothSheet: null
    } ),

    init: function( params ){

        var p = params || {};
        p.aspectRatio = 1.0;
        p.tension = p.tension || 0.5;
        p.scale = p.scale || 5.0;
        p.smoothSheet = false;

        this.smooth = p.smooth === undefined ? 2 : p.smooth;

        NGL.CartoonRepresentation.prototype.init.call( this, p );

    },

    getSpline: function( polymer ){

        var helixorient = new NGL.Helixorient( polymer );

        return new NGL.Spline( polymer, this.getSplineParams( {
            directional: false,
            positionIterator: helixorient.getCenterIterator( this.smooth )
        } ) );

    }

} );


NGL.ContactRepresentation = function( structure, viewer, params ){

    NGL.StructureRepresentation.call( this, structure, viewer, params );

};

NGL.ContactRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.ContactRepresentation,

    type: "contact",

    defaultSize: 0.25,

    parameters: Object.assign( {

        contactType: {
            type: "select", rebuild: true,
            options: {
                "polar": "polar",
                "polarBackbone": "polar backbone"
            }
        },
        maxDistance: {
            type: "number", precision: 1, max: 10, min: 0.1, rebuild: true
        },
        maxAngle: {
            type: "integer", max: 180, min: 0, rebuild: true
        },
        radiusSegments: {
            type: "integer", max: 25, min: 5, rebuild: "impostor"
        },
        disableImpostor: {
            type: "boolean", rebuild: true
        }

    }, NGL.StructureRepresentation.prototype.parameters ),

    init: function( params ){

        var p = params || {};
        p.radius = p.radius || this.defaultSize;

        if( p.quality === "low" ){
            this.radiusSegments = 5;
        }else if( p.quality === "medium" ){
            this.radiusSegments = 10;
        }else if( p.quality === "high" ){
            this.radiusSegments = 20;
        }else{
            this.radiusSegments = p.radiusSegments !== undefined ? p.radiusSegments : 10;
        }
        this.disableImpostor = p.disableImpostor || false;

        this.contactType = p.contactType || "polarBackbone";
        this.maxDistance = p.maxDistance || 3.5;
        this.maxAngle = p.maxAngle || 40;

        NGL.StructureRepresentation.prototype.init.call( this, p );

    },

    getContactData: function( sview ){

        var contactsFnDict = {
            "polar": NGL.polarContacts,
            "polarBackbone": NGL.polarBackboneContacts
        };

        var contactData = contactsFnDict[ this.contactType ](
            sview, this.maxDistance, this.maxAngle
        );

        return contactData;

    },

    getBondData: function( sview, what, params ){

        return sview.getBondData( this.getBondParams( what, params ) );

    },

    createData: function( sview ){

        var contactData = this.getContactData( sview );

        var bondParams = {
            bondSet: contactData.bondSet,
            bondStore: contactData.bondStore
        };

        var bondData = this.getBondData( sview, undefined, bondParams );

        var cylinderBuffer = new NGL.CylinderBuffer(
            bondData.position1,
            bondData.position2,
            bondData.color1,
            bondData.color2,
            bondData.radius,
            bondData.pickingColor1,
            bondData.pickingColor2,
            this.getBufferParams( {
                shift: 0,
                cap: true,
                radiusSegments: this.radiusSegments,
                disableImpostor: this.disableImpostor,
                dullInterior: true
            } )
        );

        return {
            bufferList: [ cylinderBuffer ],
            bondSet: contactData.bondSet,
            bondStore: contactData.bondStore
        };

    },

    updateData: function( what, data ){

        if( !what || what[ "position" ] ){
            var contactData = this.getContactData( data.sview );
            data.bondSet = contactData.bondSet;
            data.bondStore = contactData.bondStore;
        }

        var bondParams = {
            bondSet: data.bondSet,
            bondStore: data.bondStore
        };

        var bondData = this.getBondData( data.sview, what, bondParams );
        var cylinderData = {};

        if( !what || what[ "position" ] ){

            cylinderData[ "position" ] = NGL.Utils.calculateCenterArray(
                bondData.position1, bondData.position2
            );
            cylinderData[ "position1" ] = bondData.position1;
            cylinderData[ "position2" ] = bondData.position2;
        }

        if( !what || what[ "color" ] ){
            cylinderData[ "color" ] = bondData.color1;
            cylinderData[ "color2" ] = bondData.color2;
        }

        if( !what || what[ "radius" ] ){
            cylinderData[ "radius" ] = bondData.radius;
        }

        data.bufferList[ 0 ].setAttributes( cylinderData );

    }

} );


NGL.MolecularSurfaceRepresentation = function( structure, viewer, params ){

    this.__infoList = [];

    NGL.StructureRepresentation.call( this, structure, viewer, params );

    // TODO find a more direct way
    this.structure.signals.refreshed.add( function(){
        this.__forceNewMolsurf = true;
    }, this );

};

NGL.MolecularSurfaceRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.MolecularSurfaceRepresentation,

    type: "surface",

    parameters: Object.assign( {

        surfaceType: {
            type: "select", rebuild: true,
            options: {
                "vws": "vws",
                "sas": "sas",
                "ms": "ms",
                "ses": "ses"
            }
        },
        probeRadius: {
            type: "number", precision: 1, max: 20, min: 0,
            rebuild: true
        },
        smooth: {
            type: "integer", precision: 1, max: 10, min: 0,
            rebuild: true
        },
        scaleFactor: {
            type: "number", precision: 1, max: 5, min: 0,
            rebuild: true
        },
        cutoff: {
            type: "number", precision: 2, max: 50, min: 0,
            rebuild: true
        },
        background: {
            type: "boolean", rebuild: true  // FIXME
        },
        opaqueBack: {
            type: "boolean", buffer: true
        },
        lowResolution: {
            type: "boolean", rebuild: true
        },
        filterSele: {
            type: "text"
        },
        volume: {
            type: "hidden"
        }

    }, NGL.StructureRepresentation.prototype.parameters, {

        radiusType: null,
        radius: null,
        scale: null

    } ),

    init: function( params ){

        var p = params || {};
        p.colorScheme = p.colorScheme || "uniform";
        p.colorValue = p.colorValue !== undefined ? p.colorValue : 0xDDDDDD;

        this.surfaceType = p.surfaceType !== undefined ? p.surfaceType : "ms";
        this.probeRadius = p.probeRadius !== undefined ? p.probeRadius : 1.4;
        this.smooth = p.smooth !== undefined ? p.smooth : 2;
        this.scaleFactor = p.scaleFactor !== undefined ? p.scaleFactor : 2.0;
        this.cutoff = p.cutoff || 0.0;
        this.background = p.background || false;
        this.opaqueBack = p.opaqueBack !== undefined ? p.opaqueBack : true;
        this.lowResolution = p.lowResolution !== undefined ? p.lowResolution : false;
        this.filterSele = p.filterSele !== undefined ? p.filterSele : "";
        this.volume = p.volume || undefined;

        NGL.StructureRepresentation.prototype.init.call( this, params );

    },

    prepareData: function( sview, i, callback ){

        var info = this.__infoList[ i ];
        if( !info ){
            info = {};
            this.__infoList[ i ] = info;
        }

        if( !info.molsurf || info.sele !== sview.selection.string ){

            info.sele = sview.selection.string;
            info.molsurf = new NGL.MolecularSurface( sview );

            var p = this.getSurfaceParams();
            var afterWorker = function( surface ){
                info.surface = surface;
                callback( i );
            };
            info.molsurf.getSurfaceWorker( p, afterWorker );

        }else{

            callback( i );

        }

    },

    prepare: function( callback ){

        if( this.__forceNewMolsurf || this.__sele !== this.selection.string ||
                this.__surfaceParams !== JSON.stringify( this.getSurfaceParams() ) ){
            this.__infoList.forEach( function( info, i ){
                info.molsurf.dispose();
            }.bind( this ) );
            this.__infoList.length = 0;
        }

        if( this.structureView.atomCount === 0 ){
            callback();
            return
        }

        var after = function(){
            this.__sele = this.selection.string;
            this.__surfaceParams = JSON.stringify( this.getSurfaceParams() );
            this.__forceNewMolsurf = false;
            callback()
        }.bind( this );

        var name = this.assembly || this.structure.defaultAssembly;
        var assembly = this.structure.biomolDict[ name ];

        if( assembly ){
            assembly.partList.forEach( function( part, i ){
                var sview = part.getView( this.structureView );
                this.prepareData( sview, i, function( _i ){
                    if( _i === assembly.partList.length - 1 ) after();
                }.bind( this ) );
            }, this );
        }else{
            this.prepareData( this.structureView, 0, after );
        }

    },

    createData: function( sview, i ){

        var info = this.__infoList[ i ];

        var surfaceBuffer = new NGL.SurfaceBuffer(
            info.surface.getPosition(),
            info.surface.getColor( this.getColorParams() ),
            info.surface.getFilteredIndex( this.filterSele, sview ),
            info.surface.getNormal(),
            info.surface.getPickingColor( this.getColorParams() ),
            this.getBufferParams( {
                background: this.background,
                opaqueBack: this.opaqueBack,
                dullInterior: false
            } )
        );
        var doubleSidedBuffer = new NGL.DoubleSidedBuffer( surfaceBuffer );

        return {
            bufferList: [ doubleSidedBuffer ],
            info: info
        };

    },

    updateData: function( what, data ){

        var surfaceData = {};

        if( what[ "position" ] ){
            this.__forceNewMolsurf = true;
            this.build();
            return;
        }

        if( what[ "color" ] ){
            surfaceData[ "color" ] = data.info.surface.getColor( this.getColorParams() );
        }

        if( what[ "index" ] ){
            surfaceData[ "index" ] = data.info.surface.getFilteredIndex( this.filterSele, data.sview );
        }

        data.bufferList[ 0 ].setAttributes( surfaceData );

    },

    setParameters: function( params, what, rebuild ){

        what = what || {};

        if( params && params[ "filterSele" ] ){
            what[ "index" ] = true;
        }

        if( params && params[ "volume" ] !== undefined ){
            what[ "color" ] = true;
        }

        NGL.StructureRepresentation.prototype.setParameters.call(
            this, params, what, rebuild
        );

        return this;

    },

    getSurfaceParams: function( params ){

        var p = Object.assign( {
            type: this.surfaceType,
            probeRadius: this.probeRadius,
            scaleFactor: this.scaleFactor,
            smooth: this.smooth,
            lowRes: this.lowResolution,
            cutoff: this.cutoff,
            useWorker: this.useWorker
        }, params );

        return p;

    },

    getColorParams: function(){

        var p = NGL.StructureRepresentation.prototype.getColorParams.call( this );

        p.volume = this.volume;

        return p;

    },

    clear: function(){

        NGL.StructureRepresentation.prototype.clear.call( this );

    },

    dispose: function(){

        this.__infoList.forEach( function( info, i ){
            info.molsurf.dispose();
        }.bind( this ) );
        this.__infoList.length = 0;

        NGL.StructureRepresentation.prototype.dispose.call( this );

    }

} );


NGL.DistanceRepresentation = function( structure, viewer, params ){

    NGL.StructureRepresentation.call( this, structure, viewer, params );

};

NGL.DistanceRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.DistanceRepresentation,

    type: "distance",

    defaultSize: 0.15,

    parameters: Object.assign( {

        labelSize: {
            type: "number", precision: 3, max: 10.0, min: 0.001
        },
        labelColor: {
            type: "color"
        },
        labelVisible: {
            type: "boolean"
        },
        atomPair: {
            type: "hidden", rebuild: true
        },
        radiusSegments: {
            type: "integer", max: 25, min: 5, rebuild: "impostor"
        },
        disableImpostor: {
            type: "boolean", rebuild: true
        }

    }, NGL.StructureRepresentation.prototype.parameters, {
        flatShaded: null,
        assembly: null
    } ),

    init: function( params ){

        var p = params || {};
        p.radius = p.radius || this.defaultSize;

        if( p.quality === "low" ){
            this.radiusSegments = 5;
        }else if( p.quality === "medium" ){
            this.radiusSegments = 10;
        }else if( p.quality === "high" ){
            this.radiusSegments = 20;
        }else{
            this.radiusSegments = p.radiusSegments !== undefined ? p.radiusSegments : 10;
        }
        this.disableImpostor = p.disableImpostor || false;

        this.fontFamily = p.fontFamily || "sans-serif";
        this.fontStyle = p.fontStyle || "normal";
        this.fontWeight = p.fontWeight || "bold";
        this.sdf = p.sdf !== undefined ? p.sdf : NGL.browser !== "Firefox";  // FIXME
        this.labelSize = p.labelSize || 2.0;
        this.labelColor = p.labelColor || 0xFFFFFF;
        this.labelVisible = p.labelVisible !== undefined ? p.labelVisible : true;
        this.atomPair = p.atomPair || [];

        NGL.StructureRepresentation.prototype.init.call( this, p );

    },

    getDistanceData: function( sview, atomPair ){

        var n = atomPair.length;
        var text = new Array( n );
        var position = new Float32Array( n * 3 );
        var sele1 = new NGL.Selection();
        var sele2 = new NGL.Selection();

        var bondStore = new NGL.BondStore();

        var ap1 = sview.getAtomProxy();
        var ap2 = sview.getAtomProxy();

        var j = 0;

        atomPair.forEach( function( pair, i ){

            i -= j;
            var i3 = i * 3;

            sele1.setString( pair[ 0 ] );
            sele2.setString( pair[ 1 ] );

            var atomIndices1 = sview.getAtomIndices( sele1 );
            var atomIndices2 = sview.getAtomIndices( sele2 );

            if( atomIndices1.length && atomIndices2.length ){

                ap1.index = atomIndices1[ 0 ];
                ap2.index = atomIndices2[ 0 ];

                bondStore.addBond( ap1, ap2, 1 );

                text[ i ] = ap1.distanceTo( ap2 ).toFixed( 2 );

                position[ i3 + 0 ] = ( ap1.x + ap2.x ) / 2;
                position[ i3 + 1 ] = ( ap1.y + ap2.y ) / 2;
                position[ i3 + 2 ] = ( ap1.z + ap2.z ) / 2;

            }else{

                j += 1;

            }

        }, this );

        if( j > 0 ){
            n -= j;
            position = position.subarray( 0, n * 3 );
        }

        var bondSet = new TypedFastBitSet( bondStore.count );
        bondSet.set_all( true );

        return {
            text: text,
            position: position,
            bondSet: bondSet,
            bondStore: bondStore
        };

    },

    getBondData: function( sview, what, params ){

        return sview.getBondData( this.getBondParams( what, params ) );

    },

    create: function(){

        if( this.structureView.atomCount === 0 ) return;

        var n = this.atomPair.length;
        if( n === 0 ) return;

        var distanceData = this.getDistanceData( this.structureView, this.atomPair );

        var c = new THREE.Color( this.labelColor );

        this.textBuffer = new NGL.TextBuffer(
            distanceData.position,
            NGL.Utils.uniformArray( n, this.labelSize ),
            NGL.Utils.uniformArray3( n, c.r, c.g, c.b ),
            distanceData.text,
            this.getBufferParams( {
                fontFamily: this.fontFamily,
                fontStyle: this.fontStyle,
                fontWeight: this.fontWeight,
                sdf: this.sdf,
                opacity: 1.0,
                visible: this.labelVisible
            } )
        );

        var bondParams = {
            bondSet: distanceData.bondSet,
            bondStore: distanceData.bondStore
        };

        var bondData = this.getBondData( this.structureView, undefined, bondParams );

        this.cylinderBuffer = new NGL.CylinderBuffer(
            bondData.position1,
            bondData.position2,
            bondData.color1,
            bondData.color2,
            bondData.radius,
            bondData.pickingColor1,
            bondData.pickingColor2,
            this.getBufferParams( {
                shift: 0,
                cap: true,
                radiusSegments: this.radiusSegments,
                disableImpostor: this.disableImpostor,
                dullInterior: true
            } )
        );

        this.dataList.push( {
            sview: this.structureView,
            bondSet: distanceData.bondSet,
            bondStore: distanceData.bondStore,
            position: distanceData.position,
            bufferList: [ this.textBuffer, this.cylinderBuffer ]
        } );

    },

    updateData: function( what, data ){

        if( !what || what[ "position" ] ){
            var distanceData = this.getDistanceData( data.sview, this.atomPair );
            data.bondSet = distanceData.bondSet;
            data.bondStore = distanceData.bondStore;
            data.position = distanceData.position;
        }

        var bondParams = {
            bondSet: data.bondSet,
            bondStore: data.bondStore
        };

        var bondData = this.getBondData( data.sview, what, bondParams );
        var cylinderData = {};
        var textData = {};
        var n = this.atomPair.length;

        if( what[ "position" ] ){
            textData[ "position" ] = data.position;
            cylinderData[ "position" ] = NGL.Utils.calculateCenterArray(
                bondData.position1, bondData.position2
            );
            cylinderData[ "position1" ] = bondData.position1;
            cylinderData[ "position2" ] = bondData.position2;
        }

        if( what[ "labelSize" ] ){
            textData[ "size" ] = NGL.Utils.uniformArray( n, this.labelSize );
        }

        if( what[ "labelColor" ] ){
            var c = new THREE.Color( this.labelColor );
            textData[ "color" ] = NGL.Utils.uniformArray3( n, c.r, c.g, c.b );
        }

        if( what[ "color" ] ){
            cylinderData[ "color" ] = bondData.color1;
            cylinderData[ "color2" ] = bondData.color2;
        }

        if( what[ "radius" ] || what[ "scale" ] ){
            cylinderData[ "radius" ] = bondData.radius;
        }

        this.textBuffer.setAttributes( textData );
        this.cylinderBuffer.setAttributes( cylinderData );

    },

    setVisibility: function( value, noRenderRequest ){

        NGL.StructureRepresentation.prototype.setVisibility.call(
            this, value, true
        );

        if( this.textBuffer ){

            this.textBuffer.setVisibility(
                this.labelVisible && this.visible
            );

        }

        if( !noRenderRequest ) this.viewer.requestRender();

        return this;

    },

    setParameters: function( params ){

        var rebuild = false;
        var what = {};

        if( params && params[ "labelSize" ] ){

            what[ "labelSize" ] = true;

        }

        if( params && params[ "labelColor" ] ){

            what[ "labelColor" ] = true;

        }

        NGL.StructureRepresentation.prototype.setParameters.call(
            this, params, what, rebuild
        );

        if( params && params[ "labelVisible" ] !== undefined ){

            this.setVisibility( this.visible );

        }

        return this;

    }

} );


//////////////////////////////
// Trajectory representation

NGL.TrajectoryRepresentation = function( trajectory, viewer, params ){

    this.manualAttach = true;

    this.trajectory = trajectory;

    NGL.StructureRepresentation.call(
        this, trajectory.structure, viewer, params
    );

};

NGL.TrajectoryRepresentation.prototype = NGL.createObject(

    NGL.StructureRepresentation.prototype, {

    constructor: NGL.TrajectoryRepresentation,

    type: "",

    parameters: Object.assign( {

        drawLine: {
            type: "boolean", rebuild: true
        },
        drawCylinder: {
            type: "boolean", rebuild: true
        },
        drawPoint: {
            type: "boolean", rebuild: true
        },
        drawSphere: {
            type: "boolean", rebuild: true
        },

        linewidth: {
            type: "integer", max: 20, min: 1, rebuild: true
        },
        pointSize: {
            type: "integer", max: 20, min: 1, rebuild: true
        },
        sizeAttenuation: {
            type: "boolean", rebuild: true
        },
        sort: {
            type: "boolean", rebuild: true
        },

    }, NGL.Representation.prototype.parameters ),

    init: function( params ){

        var p = params || {};
        p.colorScheme = p.colorScheme || "uniform";
        p.colorValue = p.colorValue || 0xDDDDDD;

        this.drawLine = p.drawLine || true;
        this.drawCylinder = p.drawCylinder || false;
        this.drawPoint = p.drawPoint || false;
        this.drawSphere = p.drawSphere || false;

        this.pointSize = p.pointSize || 1;
        this.sizeAttenuation = p.sizeAttenuation !== undefined ? p.sizeAttenuation : false;
        this.sort = p.sort !== undefined ? p.sort : true;

        NGL.StructureRepresentation.prototype.init.call( this, p );

    },

    attach: function( callback ){

        this.bufferList.forEach( function( buffer ){

            this.viewer.add( buffer );

        }, this );

        this.setVisibility( this.visible );

        callback();

    },

    prepare: function( callback ){

        // TODO

        callback();

    },

    create: function(){

        // NGL.log( this.selection )
        // NGL.log( this.atomSet )

        if( this.atomSet.atomCount === 0 ) return;

        var scope = this;

        var index = this.atomSet.atoms[ 0 ].index;

        this.trajectory.getPath( index, function( path ){

            var n = path.length / 3;
            var tc = new THREE.Color( scope.colorValue );

            if( scope.drawSphere ){

                var sphereBuffer = new NGL.SphereBuffer(
                    path,
                    NGL.Utils.uniformArray3( n, tc.r, tc.g, tc.b ),
                    NGL.Utils.uniformArray( n, 0.2 ),
                    NGL.Utils.uniformArray3( n, tc.r, tc.g, tc.b ),
                    scope.getBufferParams( {
                        sphereDetail: scope.sphereDetail,
                        dullInterior: true,
                        disableImpostor: scope.disableImpostor
                    } )
                );

                scope.bufferList.push( sphereBuffer );

            }

            if( scope.drawCylinder ){

                var cylinderBuffer = new NGL.CylinderBuffer(
                    path.subarray( 0, -3 ),
                    path.subarray( 3 ),
                    NGL.Utils.uniformArray3( n - 1, tc.r, tc.g, tc.b ),
                    NGL.Utils.uniformArray3( n - 1, tc.r, tc.g, tc.b ),
                    NGL.Utils.uniformArray( n, 0.05 ),
                    NGL.Utils.uniformArray3( n - 1, tc.r, tc.g, tc.b ),
                    NGL.Utils.uniformArray3( n - 1, tc.r, tc.g, tc.b ),
                    scope.getBufferParams( {
                        shift: 0,
                        cap: true,
                        radiusSegments: scope.radiusSegments,
                        disableImpostor: scope.disableImpostor,
                        dullInterior: true
                    } )

                );

                scope.bufferList.push( cylinderBuffer );

            }

            if( scope.drawPoint ){

                var pointBuffer = new NGL.PointBuffer(
                    path,
                    NGL.Utils.uniformArray3( n, tc.r, tc.g, tc.b ),
                    scope.getBufferParams( {
                        pointSize: scope.pointSize,
                        sizeAttenuation: scope.sizeAttenuation,
                        sort: scope.sort,
                    } )
                );

                scope.bufferList.push( pointBuffer );

            }

            if( scope.drawLine ){

                var lineBuffer = new NGL.LineBuffer(
                    path.subarray( 0, -3 ),
                    path.subarray( 3 ),
                    NGL.Utils.uniformArray3( n - 1, tc.r, tc.g, tc.b ),
                    NGL.Utils.uniformArray3( n - 1, tc.r, tc.g, tc.b ),
                    scope.getBufferParams()
                );

                scope.bufferList.push( lineBuffer );

            }

            scope.attach();

        } );

    }

} );


///////////////////////////
// Surface representation

NGL.SurfaceRepresentation = function( surface, viewer, params ){

    NGL.Representation.call( this, surface, viewer, params );

    if( surface instanceof NGL.Volume ){
        this.surface = undefined;
        this.volume = surface;
    }else{
        this.surface = surface;
        this.volume = undefined;
    }

    this.boxCenter = new THREE.Vector3();
    this.__boxCenter = new THREE.Vector3();
    this.box = new THREE.Box3();
    this.__box = new THREE.Box3();

    this.setBox = ( function(){
        var position = new THREE.Vector3();
        return function(){
            var target = viewer.controls.target;
            var group = viewer.rotationGroup.position;
            position.copy( group ).negate().add( target );
            this.setParameters( { "boxCenter": position } );
        }.bind( this );
    }.bind( this ) )();

    this.viewer.signals.orientationChanged.add(
        this.setBox
    );

    this.build();

};

NGL.SurfaceRepresentation.prototype = NGL.createObject(

    NGL.Representation.prototype, {

    constructor: NGL.SurfaceRepresentation,

    type: "surface",

    parameters: Object.assign( {

        isolevelType: {
            type: "select", options: {
                "value": "value", "sigma": "sigma"
            }
        },
        isolevel: {
            type: "number", precision: 2, max: 1000, min: -1000
        },
        smooth: {
            type: "integer", precision: 1, max: 10, min: 0
        },
        background: {
            type: "boolean", rebuild: true  // FIXME
        },
        opaqueBack: {
            type: "boolean", buffer: true
        },
        boxSize: {
            type: "integer", precision: 1, max: 100, min: 0
        }

    }, NGL.Representation.prototype.parameters ),

    init: function( params ){

        var p = params || {};
        p.colorScheme = p.colorScheme || "uniform";
        p.colorValue = p.colorValue !== undefined ? p.colorValue : 0xDDDDDD;

        this.isolevelType  = p.isolevelType !== undefined ? p.isolevelType : "sigma";
        this.isolevel = p.isolevel !== undefined ? p.isolevel : 2.0;
        this.smooth = p.smooth !== undefined ? p.smooth : 0;
        this.background = p.background || false;
        this.opaqueBack = p.opaqueBack !== undefined ? p.opaqueBack : true;
        this.boxSize = p.boxSize !== undefined ? p.boxSize : 0;

        NGL.Representation.prototype.init.call( this, p );

    },

    attach: function( callback ){

        this.bufferList.forEach( function( buffer ){

            this.viewer.add( buffer );

        }, this );

        this.setVisibility( this.visible );

        callback();

    },

    prepare: function( callback ){

        if( this.volume ){

            var isolevel;

            if( this.isolevelType === "sigma" ){
                isolevel = this.volume.getValueForSigma( this.isolevel );
            }else{
                isolevel = this.isolevel;
            }

            if( !this.surface ||
                this.__isolevel !== isolevel ||
                this.__smooth !== this.smooth ||
                this.__boxSize !== this.boxSize ||
                ( this.boxSize > 0 &&
                    !this.__boxCenter.equals( this.boxCenter ) )
            ){
                this.__isolevel = isolevel;
                this.__smooth = this.smooth;
                this.__boxSize = this.boxSize;
                this.__boxCenter.copy( this.boxCenter );
                this.__box.copy( this.box );

                this.volume.getSurfaceWorker(
                    isolevel, this.smooth, this.boxCenter, this.boxSize,
                    function( surface ){
                        this.surface = surface;
                        callback();
                    }.bind( this )
                );
            }else{
                callback();
            }

        }else{
            callback();
        }

    },

    create: function(){

        var surfaceBuffer = new NGL.SurfaceBuffer(
            this.surface.getPosition(),
            this.surface.getColor( this.getColorParams() ),
            this.surface.getIndex(),
            this.surface.getNormal(),
            undefined,  // this.surface.getPickingColor( this.getColorParams() ),
            this.getBufferParams( {
                background: this.background,
                opaqueBack: this.opaqueBack,
                dullInterior: false,
            } )
        );
        var doubleSidedBuffer = new NGL.DoubleSidedBuffer( surfaceBuffer );

        this.bufferList.push( doubleSidedBuffer );

    },

    update: function( what ){

        if( this.bufferList.length === 0 ) return;

        what = what || {};

        var surfaceData = {};

        if( what[ "position" ] ){
            surfaceData[ "position" ] = this.surface.getPosition();
        }

        if( what[ "color" ] ){
            surfaceData[ "color" ] = this.surface.getColor(
                this.getColorParams()
            );
        }

        if( what[ "index" ] ){
            surfaceData[ "index" ] = this.surface.getIndex();
        }

        if( what[ "normal" ] ){
            surfaceData[ "normal" ] = this.surface.getNormal();
        }

        this.bufferList.forEach( function( buffer ){
            buffer.setAttributes( surfaceData );
        } );

    },

    setParameters: function( params, what, rebuild ){

        if( params && params[ "isolevelType" ] !== undefined &&
            this.volume
        ){

            if( this.isolevelType === "value" &&
                params[ "isolevelType" ] === "sigma"
            ){

                this.isolevel = this.volume.getSigmaForValue(
                    this.isolevel
                );

            }else if( this.isolevelType === "sigma" &&
                params[ "isolevelType" ] === "value"
            ){

                this.isolevel = this.volume.getValueForSigma(
                    this.isolevel
                );

            }

            this.isolevelType = params[ "isolevelType" ];

        }

        if( params && params[ "boxCenter" ] ){
            this.boxCenter.copy( params[ "boxCenter" ] );
            delete params[ "boxCenter" ];
        }

        NGL.Representation.prototype.setParameters.call(
            this, params, what, rebuild
        );

        if( this.volume ){
            this.volume.getBox( this.boxCenter, this.boxSize, this.box );
        }

        if( this.surface && (
                params[ "isolevel" ] !== undefined ||
                params[ "smooth" ] !== undefined ||
                params[ "boxSize" ] !== undefined ||
                ( this.boxSize > 0 &&
                    !this.__box.equals( this.box ) )
            )
        ){
            this.build( {
                "__update": {
                    "position": true,
                    "color": true,
                    "index": true,
                    "normal": true
                }
            } );
        }

        return this;

    },

    dispose: function(){

        this.viewer.signals.orientationChanged.remove(
            this.setBox
        );

        NGL.Representation.prototype.dispose.call( this );

    }

} );


NGL.DotRepresentation = function( surface, viewer, params ){

    NGL.Representation.call( this, surface, viewer, params );

    if( surface instanceof NGL.Volume ){
        this.surface = undefined;
        this.volume = surface;
    }else{
        this.surface = surface;
        this.volume = undefined;
    }

    this.build();

};

NGL.DotRepresentation.prototype = NGL.createObject(

    NGL.Representation.prototype, {

    constructor: NGL.DotRepresentation,

    type: "dot",

    parameters: Object.assign( {

        thresholdType: {
            type: "select", rebuild: true, options: {
                "value": "value", "sigma": "sigma"
            }
        },
        thresholdMin: {
            type: "number", precision: 3, max: Infinity, min: -Infinity, rebuild: true
        },
        thresholdMax: {
            type: "number", precision: 3, max: Infinity, min: -Infinity, rebuild: true
        },
        thresholdOut: {
            type: "boolean", rebuild: true
        },
        dotType: {
            type: "select", rebuild: true, options: {
                "": "",
                "sphere": "sphere",
                "point": "point"
            }
        },
        radiusType: {
            type: "select", options: {
                "": "",
                "value": "value",
                "abs-value": "abs-value",
                "value-min": "value-min",
                "deviation": "deviation",
                "size": "size"
            }
        },
        radius: {
            type: "number", precision: 3, max: 10.0, min: 0.001, property: "size"
        },
        scale: {
            type: "number", precision: 3, max: 10.0, min: 0.001
        },
        sphereDetail: {
            type: "integer", max: 3, min: 0, rebuild: "impostor"
        },
        disableImpostor: {
            type: "boolean", rebuild: true
        },

        pointSize: {
            type: "number", precision: 1, max: 100, min: 0, buffer: true
        },
        sizeAttenuation: {
            type: "boolean", buffer: true
        },
        sortParticles: {
            type: "boolean", rebuild: true
        },
        useTexture: {
            type: "boolean", buffer: true
        },
        alphaTest: {
            type: "range", step: 0.001, max: 1, min: 0, buffer: true
        },
        forceTransparent: {
            type: "boolean", buffer: true
        },
        edgeBleach: {
            type: "range", step: 0.001, max: 1, min: 0, buffer: true
        },

    }, NGL.Representation.prototype.parameters, {

        colorScheme: {
            type: "select", update: "color", options: {
                "": "",
                "value": "value",
                "uniform": "uniform",
                // "value-min": "value-min",
                // "deviation": "deviation",
                // "size": "size"
            }
        },

    } ),

    defaultSize: 0.1,

    init: function( params ){

        var p = params || {};
        p.colorScheme = p.colorScheme || "uniform";
        p.colorValue = p.colorValue || 0xDDDDDD;

        if( p.quality === "low" ){
            this.sphereDetail = 0;
        }else if( p.quality === "medium" ){
            this.sphereDetail = 1;
        }else if( p.quality === "high" ){
            this.sphereDetail = 2;
        }else{
            this.sphereDetail = p.sphereDetail || 1;
        }
        this.disableImpostor = p.disableImpostor || false;

        this.thresholdType  = p.thresholdType !== undefined ? p.thresholdType : "sigma";
        this.thresholdMin = p.thresholdMin !== undefined ? p.thresholdMin : 2.0;
        this.thresholdMax = p.thresholdMax !== undefined ? p.thresholdMax : Infinity;
        this.thresholdOut = p.thresholdOut !== undefined ? p.thresholdOut : false;
        this.dotType = p.dotType !== undefined ? p.dotType : "point";
        this.radius = p.radius !== undefined ? p.radius : 0.1;
        this.scale = p.scale !== undefined ? p.scale : 1.0;

        this.pointSize = p.pointSize || 1;
        this.sizeAttenuation = p.sizeAttenuation !== undefined ? p.sizeAttenuation : true;
        this.sortParticles = p.sortParticles !== undefined ? p.sortParticles : false;
        this.useTexture = p.useTexture !== undefined ? p.useTexture : false;
        this.alphaTest = p.alphaTest !== undefined ? p.alphaTest : 0.5;
        this.forceTransparent = p.forceTransparent !== undefined ? p.forceTransparent : false;
        this.edgeBleach = p.edgeBleach !== undefined ? p.edgeBleach : 0.0;

        NGL.Representation.prototype.init.call( this, p );

    },

    attach: function( callback ){

        this.bufferList.forEach( function( buffer ){

            this.viewer.add( buffer );

        }, this );

        this.setVisibility( this.visible );

        callback();

    },

    create: function(){

        var position, color, size, pickingColor;

        if( this.volume ){

            var thresholdMin, thresholdMax;

            if( this.thresholdType === "sigma" ){
                thresholdMin = this.volume.getValueForSigma( this.thresholdMin );
                thresholdMax = this.volume.getValueForSigma( this.thresholdMax );
            }else{
                thresholdMin = this.thresholdMin;
                thresholdMax = this.thresholdMax;
            }
            this.volume.filterData( thresholdMin, thresholdMax, this.thresholdOut );

            position = this.volume.getDataPosition();
            color = this.volume.getDataColor( this.getColorParams() );
            size = this.volume.getDataSize( this.radius, this.scale );
            pickingColor = this.volume.getPickingDataColor( this.getColorParams() );

        }else{

            position = this.surface.getPosition();
            color = this.surface.getColor( this.getColorParams() );
            size = this.surface.getSize( this.radius, this.scale );
            pickingColor = this.surface.getPickingColor( this.getColorParams() );

        }

        if( this.dotType === "sphere" ){

            this.dotBuffer = new NGL.SphereBuffer(
                position,
                color,
                size,
                pickingColor,
                this.getBufferParams( {
                    sphereDetail: this.sphereDetail,
                    disableImpostor: this.disableImpostor,
                    dullInterior: false
                } )
            );

        }else{

            this.dotBuffer = new NGL.PointBuffer(
                position,
                color,
                this.getBufferParams( {
                    pointSize: this.pointSize,
                    sizeAttenuation: this.sizeAttenuation,
                    sortParticles: this.sortParticles,
                    useTexture: this.useTexture,
                    alphaTest: this.alphaTest,
                    forceTransparent: this.forceTransparent,
                    edgeBleach: this.edgeBleach
                } )
            );

        }

        this.bufferList.push( this.dotBuffer );

    },

    update: function( what ){

        if( this.bufferList.length === 0 ) return;

        what = what || {};

        var dotData = {};

        if( what[ "color" ] ){

            if( this.volume ){

                dotData[ "color" ] = this.volume.getDataColor(
                    this.getColorParams()
                );

            }else{

                dotData[ "color" ] = this.surface.getColor(
                    this.getColorParams()
                );

            }

        }

        if( this.dotType === "sphere" && ( what[ "radius" ] || what[ "scale" ] ) ){

            if( this.volume ){

                dotData[ "radius" ] = this.volume.getDataSize(
                    this.radius, this.scale
                );

            }else{

                dotData[ "radius" ] = this.surface.getSize(
                    this.radius, this.scale
                );

            }

        }

        this.dotBuffer.setAttributes( dotData );

    },

    setParameters: function( params, what, rebuild ){

        what = what || {};

        if( params && params[ "thresholdType" ] !== undefined &&
            this.volume instanceof NGL.Volume
        ){

            if( this.thresholdType === "value" &&
                params[ "thresholdType" ] === "sigma"
            ){

                this.thresholdMin = this.volume.getSigmaForValue(
                    this.thresholdMin
                );
                this.thresholdMax = this.volume.getSigmaForValue(
                    this.thresholdMax
                );

            }else if( this.thresholdType === "sigma" &&
                params[ "thresholdType" ] === "value"
            ){

                this.thresholdMin = this.volume.getValueForSigma(
                    this.thresholdMin
                );
                this.thresholdMax = this.volume.getValueForSigma(
                    this.thresholdMax
                );

            }

            this.thresholdType = params[ "thresholdType" ];

        }

        if( params && params[ "radiusType" ] !== undefined ){

            if( params[ "radiusType" ] === "radius" ){
                this.radius = this.defaultSize;
            }else{
                this.radius = params[ "radiusType" ];
            }
            what[ "radius" ] = true;
            if( this.dotType === "sphere" &&
                ( !NGL.extensionFragDepth || this.disableImpostor )
            ){
                rebuild = true;
            }

        }

        if( params && params[ "radius" ] !== undefined ){

            what[ "radius" ] = true;
            if( this.dotType === "sphere" &&
                ( !NGL.extensionFragDepth || this.disableImpostor )
            ){
                rebuild = true;
            }

        }

        if( params && params[ "scale" ] !== undefined ){

            what[ "scale" ] = true;
            if( this.dotType === "sphere" &&
                ( !NGL.extensionFragDepth || this.disableImpostor )
            ){
                rebuild = true;
            }

        }

        NGL.Representation.prototype.setParameters.call(
            this, params, what, rebuild
        );

        return this;

    }

} );


/////////////////////////
// Representation types

( function(){

    NGL.representationTypes = {};
    var reprList = [];

    // find structure representations

    for( var key in NGL ){

        var val = NGL[ key ];

        if( val.prototype instanceof NGL.StructureRepresentation &&
            val.prototype.type
        ){

            reprList.push( val );

        }

    }

    // sort by representation type (i.e. name)

    reprList.sort( function( a, b ){

            return a.prototype.type.localeCompare( b.prototype.type );

    } ).forEach( function( repr ){

        NGL.representationTypes[ repr.prototype.type ] = repr;

    } );

} )();
