import { spawn }  from "child_process";
import * as yargs from "yargs";
import * as fs from "fs";


interface TypeSignature {
    signature: string;
    name: string;
};

interface Module {
    moduleName: string;
    types: TypeSignature[];
}

function isDecoder(type: TypeSignature): boolean {
    if (type.signature.indexOf("->") > -1) return false;

    return type.signature.split(" ")[0] === "Json.Decode.Decoder";
};


function onlyDecoders(module: Module): Module {
    return {
        moduleName: module.moduleName,
        types: module.types.filter(isDecoder)
    };
};

function imports(modules: Module[]) : string[] {
    return modules
    .map((module) => "import " + module.moduleName);
};

function fullDecoderName(module: Module, type: TypeSignature) : string {
    return module.moduleName + "." + type.name;
};



function elmFile (modules: Module[]) : string {
    const importLines = imports(modules.filter((module) => module.types.length > 0));
    const allDecoderNames : string[] = [];

    modules.forEach((module) => {
        module.types.forEach((type) =>{
            allDecoderNames.push(fullDecoderName(module, type));
        })
    });

    const moduleTuples = allDecoderNames.map((decoderName) => {

        return `(\"${decoderName}\", Json.Decode.map (toString) ${decoderName})`;
    });

    return  `

module DebugDecoders exposing (main)

import Html
import Html.Attributes
import Html.Events
import Dict
import Json.Decode

${importLines.join("\n")}

decodersByName : Dict.Dict String (Json.Decode.Decoder String)
decodersByName = 
    Dict.fromList 
        [ ${moduleTuples.join("\n        , ")}
        ]

type Msg
    = ChangeJson String
    | SaveChange


type alias Model =
    { json : String
    , tempJson : String
    , knownDecoders : Dict.Dict String (Json.Decode.Decoder String)
    }


viewHowManyRan : Model -> Html.Html Msg
viewHowManyRan model =
    "I ran "
        ++ (toString <| Dict.size model.knownDecoders)
        ++ " decoders!"
        |> Html.text


viewSimpleResult : String -> Json.Decode.Decoder String -> Model -> Html.Html Msg
viewSimpleResult decoderName decoder model =
    let
        color =
            case Json.Decode.decodeString decoder model.json of
                Err v ->
                    "red"

                Ok _ ->
                    "green"
    in
        Html.div
            []
            [ Html.text decoderName
            , Html.div
                [ Html.Attributes.style [ ( "width", "50px" ), ( "height", "50px" ), ( "background-color", color ) ] ]
                []
            ]


viewInputJson : Model -> Html.Html Msg
viewInputJson model =
    Html.div
        []
        [ Html.textarea
            [ Html.Attributes.style [ ( "width", "500px" ), ( "height", "500px" ) ]
            , Html.Events.onInput ChangeJson
            , Html.Attributes.value model.tempJson
            ]
            []
        , Html.button [ Html.Events.onClick SaveChange ] [ Html.text "Test" ]
        ]


view : Model -> Html.Html Msg
view model =
    let
        decoderResults =
            Dict.toList model.knownDecoders
                |> List.map (\\( name, decoder ) -> viewSimpleResult name decoder model)
    in
        Html.div
            []
            (viewInputJson model :: viewHowManyRan model :: decoderResults)


update : Msg -> Model -> ( Model, Cmd msg )
update msg model =
    case msg of
        SaveChange ->
            ( { model | json = model.tempJson }, Cmd.none )

        ChangeJson newJson ->
            ( { model | tempJson = newJson }, Cmd.none )


main = Html.program 
    { init = ({ json = "", tempJson = "", knownDecoders = decodersByName }, Cmd.none)
    , update=  update
    , view = view 
    , subscriptions = (\\_ -> Sub.none)
    }
`;
}




function main(){

    const foundArgs = yargs
        .alias("path", "p")
        .describe("path", "A path where your elm-package.json exists")
        .default("path", process.cwd())
        .usage("Provide me with a path to your elm-package.json folder. I'll find all your decoders! Then just open the file I create in elm-reactor")
        .help()
        .alias("h", "help")
        .argv;


    const path = foundArgs.path;
    let hadError = false;

    try{
        fs.readFileSync(path + "/elm-package.json");
    } catch(e){
        console.log("elm-package.json did not exist at ", path);
        console.log("Please give me the path where your elm-package.json is!");
        process.exit(1);
    }


    const stuff = spawn("elm-interface-to-json", ["--path", path]);
    let readData = "";

    stuff.stdout.on('data', (data) => {
        readData += data;
    });

    stuff.stderr.on('data', (data) => {
        if (!hadError) {
            console.log("Error!");
            console.log("Make sure to install elm-interface-to-json globally first..");
            console.log("npm install -g elm-interface-to-json");
        }

        hadError = true;
    });

    stuff.on('close', (code) => {
        if (hadError) {
            console.log("Something went wrong while running elm-interface-to-json...");
            console.log("It exited with the code:", code);
            process.exit(code);
        }
        const parsedData = JSON.parse(readData);

        const modulesWithOnlyDecoders = parsedData.map(onlyDecoders);

        console.log('Creating a file at ', path + "/DebugDecoders.elm");
        fs.writeFileSync(path + "/DebugDecoders.elm", elmFile(modulesWithOnlyDecoders));
        console.log("Open it with elm-reactor!");
    });
    
};
main();